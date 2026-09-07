# Gemini analysis for batch reports

This function receives only a logged-in owner's report ID, reads the report image
from that owner's Supabase Storage URL, and calls Gemini server-side. The browser
never receives the Gemini key.

## One-time setup

1. Create a Gemini API key in Google AI Studio (use the free quota first).
2. In the linked Supabase project, set the Edge Function secret:

   `supabase secrets set GEMINI_API_KEY="your-key"`

3. Deploy the function:

   `supabase functions deploy analyze-batch-report`

The app uses `gemini-3.7-flash`. Gemini results are suggestions only: users must
click a suggested colour/model/part before the app changes a batch-report flow.
