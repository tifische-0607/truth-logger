export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      /* Standalone fallback page: served when the app cannot load, so it cannot read src/styles.css. Values mirror the brand tokens. */
      body { font: 16px/1.5 Inter, system-ui, -apple-system, sans-serif; background: #F5F7FA; color: #0D1118; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #5B616B; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #4F63EF; color: #FFFFFF; }
      .secondary { background: #EEF1FE; color: #0D1118; }
      a, button { min-height: 44px; border-radius: 10px; }
      body::after { content: ''; position: fixed; left: 0; right: 0; bottom: 0; height: 4px; background: linear-gradient(90deg, #4A7DFB, #6E59EA); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
