import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { resumeData, templateName = "modern" } = await req.json();
    
    // Initialize Supabase Client using local context / auth headers
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Mock HTML compilation (or integration with a PDF compiling API/utility)
    const htmlContent = `
      <html>
        <head>
          <style>body { font-family: sans-serif; padding: 20px; }</style>
        </head>
        <body>
          <h1>${resumeData.personal_info?.name || "Resume"}</h1>
          <p>${resumeData.personal_info?.email || ""}</p>
          <h2>Professional Summary</h2>
          <p>${resumeData.summary || ""}</p>
        </body>
      </html>
    `;

    // Imagine compiling to PDF binary (we return mock PDF binary array in base64 format for demo)
    const pdfBytes = new TextEncoder().encode(htmlContent);

    return new Response(pdfBytes, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=resume.pdf`
      },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
