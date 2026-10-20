# Printer announcements with Enya

Requires `verify_jwt = true`, the existing `GEMINI_API_KEY` secret, and migration
`202610200002_printer_voice_cache.sql`. No key is sent to the browser.

POST accepts `workspaceId`, `eventId`, a bounded display `name`, and the browser's
`expectedHash`. It validates the signed-in user and printer-view permission, then
derives the sentence from the stored event and fresh current printer state. It
rejects arbitrary caller text, provider/model overrides, stale jobs, resumed
machines, superseded transitions, and a sentence hash that differs from the UI.
Only a confirmed cause is spoken. A generated response cannot authorize playback:
the browser separately rechecks the currently displayed alert after loading.

The explicit `mode: "preview"` request uses one fixed transcript beginning with
"Thông báo minh họa". It still requires user/workspace permission and consumes the
same bounded generation budget/cache. It neither reads nor creates printer events.
The Nghe thử button uses this path to verify service connectivity; if unavailable,
it identifies the failure and plays the approved stored Enya sample instead.

Generation uses `gemini-3.8-flash-tts`, voice `Enya`, with `store:false`. Only the
machine display name and a fixed status/cause sentence are sent to Google; print
filenames, jobs, user credentials, and raw telemetry are excluded from that sentence.
See the [Google speech API](https://ai.google.dev/gemini-api/docs/speech-generation).

Audio uses a separate `printer-voice-enya` prefix in the existing private
`camera-sounds` bucket. It creates no camera sound library entries and changes no
camera storage policies. The service refuses playback/generation if that bucket
is public. Only this authenticated service can read the generated voice prefix.
An atomic database reservation prevents duplicate generation across devices.
At most 24 new generation attempts per workspace per UTC day are allowed; cached
sentences remain available when that limit is reached. Provider failures retain
the visual notification and expose retry; they never invoke system speech.
Local audio cache and heard-history keys include the user and workspace.

Checks: `npm run qa:printer-api`, `node tools/printer-voice-sql-qa.mjs`, and
`node tools/printer-voice-qa.mjs`. API/frontend tests mock provider/playback; they
do not establish live provider access or actual printer operation.
