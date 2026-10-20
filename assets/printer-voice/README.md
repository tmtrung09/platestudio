# Approved Enya preview

`enya-preview.wav` is the actual Vietnamese sample approved by the user (sample 2),
generated in Google AI Studio with `gemini-3.8-flash-tts`, voice `Enya`.
It is a demonstration recording, not a report from a real printer.

Transcript: "Thông báo minh họa. Máy Tiểu Mỹ Thụ đã hoàn tất mẻ in. Máy Mỹ Mỹ đã
dừng vì lỗi, không kéo được nhựa. Máy Pế Pế đã hết nhựa. Vui lòng kiểm tra máy."

PCM16, mono, 24 kHz; 12.88 seconds. The WAV byte-rate header was corrected to
48,000 bytes/second without changing the generated PCM samples.

SHA-256: `08891a432cd6c40ffa72710cee82daeecdc99d12cf5aa99e141552cbb11afa02`.

The preview loads only on user interaction. Nghe thử also checks the authenticated
service with a fixed demonstration transcript, retaining this approved sample as
the clearly identified fallback when that service is unavailable.
Actual announcements use the same
Enya voice through the authenticated `printer-voice` service, with private audio
caching. The browser never silently falls back to the rejected system voice.
