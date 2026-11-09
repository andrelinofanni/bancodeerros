import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function googleAccessToken() {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Credenciais do Google não configuradas nos secrets do Supabase.");

  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(tokenData.error_description || tokenData.error || "Não foi possível autenticar no Google.");
  return tokenData.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return response({ error: "Sessão não identificada. Entre novamente no PACE." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const spreadsheetId = Deno.env.get("GOOGLE_SHEET_ID");
    if (!supabaseUrl || !supabaseAnonKey || !spreadsheetId) {
      throw new Error("Faltam secrets obrigatórios no Supabase (SUPABASE_URL, SUPABASE_ANON_KEY ou GOOGLE_SHEET_ID).");
    }

    const jwt = authorization.replace(/^Bearer\s+/i, "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) return response({ error: "Sessão inválida. Entre novamente no PACE." }, 401);

    // A consulta usa a sessão do usuário e respeita as políticas RLS do banco.
    const { data: records, error: recordsError } = await supabase
      .from("erros_pace")
      .select("id,title,description,image_path,cause,resolution,status,notes,created_at,updated_at")
      .order("created_at", { ascending: true });
    if (recordsError) throw new Error(`Não foi possível ler os registros do PACE: ${recordsError.message}`);

    const values = [
      ["Título do erro", "O que aconteceu?", "Print ou foto", "Causa provável / causa raiz", "Como resolver", "Status", "Observações / cuidados", "ID interno"],
      ...(records || []).map((r: any) => [
        r.title || "",
        r.description || "",
        r.image_path ? "Anexado no PACE (arquivo protegido)" : "Não anexado",
        r.cause || "",
        r.resolution || "",
        r.status || "",
        r.notes || "",
        r.id,
      ]),
    ];

    const accessToken = await googleAccessToken();
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    const metaResponse = await fetch(`${base}?fields=sheets.properties(sheetId,title)`, { headers });
    const meta = await metaResponse.json();
    if (!metaResponse.ok) throw new Error(meta.error?.message || "Não foi possível abrir a planilha. Verifique se ela foi compartilhada com a conta de serviço.");
    const sheet = meta.sheets?.[0]?.properties;
    if (!sheet) throw new Error("A planilha não possui uma aba disponível.");

    const clearResponse = await fetch(`${base}/values/${encodeURIComponent("'" + sheet.title.replace(/'/g, "''") + "'!A:Z")}:clear`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    const clearData = await clearResponse.json();
    if (!clearResponse.ok) throw new Error(clearData.error?.message || "Não foi possível limpar os dados antigos da aba.");

    const range = `'${sheet.title.replace(/'/g, "''")}'!A1:H${Math.max(values.length, 1)}`;
    const updateResponse = await fetch(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: "PUT", headers, body: JSON.stringify({ majorDimension: "ROWS", values }),
    });
    const updateData = await updateResponse.json();
    if (!updateResponse.ok) throw new Error(updateData.error?.message || "Não foi possível escrever os dados na planilha.");

    await fetch(`${base}:batchUpdate`, {
      method: "POST", headers,
      body: JSON.stringify({ requests: [
        { updateSheetProperties: { properties: { sheetId: sheet.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        { updateDimensionProperties: { range: { sheetId: sheet.sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
        { repeatCell: { range: { sheetId: sheet.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      ] }),
    });

    return response({ ok: true, synchronized: (records || []).length, spreadsheetId });
  } catch (error) {
    console.error("sync-google-sheet:", error);
    return response({ error: error instanceof Error ? error.message : "Erro inesperado ao sincronizar." }, 500);
  }
});
