// Where the citation server lives. When the page is served by that server
// itself (local dev, or Render directly) calls stay same-origin; when it's
// served by Firebase Hosting they go to Render.
const SERVER = 'https://citemyshi.onrender.com';
const sameOrigin = ['localhost', '127.0.0.1'].includes(location.hostname) || location.hostname.endsWith('.onrender.com');
export const API_BASE = sameOrigin ? '' : SERVER;
