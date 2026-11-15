/**
 * Slide 5 shows a short demo video, the live LUNARIS console, or both.
 *
 * videoUrl  A short demo video. Any of these work:
 *             - a file next to this deck:   "demo.mp4"
 *             - a YouTube link:             "https://youtu.be/XXXXXXXXXXX"
 *             - a Loom or Google Drive share link
 *           When set, the video is what slide 5 shows first.
 *
 * appUrl    Public URL of the running LUNARIS console (the Next.js app),
 *           for example "https://your-app.example.com".
 *           It must be https (GitHub Pages is https, and browsers block
 *           http pages inside https ones), and it must allow being placed
 *           in an iframe: do not send X-Frame-Options: DENY or a
 *           frame-ancestors policy of 'none'.
 *
 * With both set, slide 5 opens on the video and offers a "Try the live app"
 * switch. With neither set, it shows the setup form.
 *
 * Query strings win over this file, which is useful while rehearsing:
 *   ?app=http://localhost:3000
 *   ?video=demo.mp4
 */
window.LUNARIS_DECK = {
  videoUrl: "",
  appUrl: "",
};