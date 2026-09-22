// SDK-owned, development-only mock ad UI. Game markup and styles are not required.
const CSS = `
:host { all: initial; position: fixed; inset: 0; z-index: 2147483646; color-scheme: dark; font-family: system-ui, sans-serif; }
:host([hidden]) { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }
.backdrop { position: fixed; inset: 0; display: grid; place-items: center; background: #050710f5; color: #f8fafc; padding: 16px; padding-top: max(16px, env(safe-area-inset-top)); padding-bottom: max(16px, env(safe-area-inset-bottom)); }
.card { width: min(460px, 100%); max-height: 96dvh; overflow-y: auto; display: grid; gap: 12px; border-radius: 18px; padding: 18px; background: #121827; border: 1px solid #465571; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.badge { font-size: 12px; color: #cbd5e1; font-weight: 700; }
h2, p { margin: 0; }
h2 { font-size: 20px; }
p { color: #cbd5e1; font-size: 14px; line-height: 1.4; }
.video { display: block; width: 100%; max-height: 58dvh; background: #000; object-fit: contain; cursor: pointer; }
.actions { display: flex; gap: 10px; }
button { min-height: 48px; flex: 1; border-radius: 10px; border: 1px solid #8392ab; padding: 10px; font: inherit; font-weight: 700; color: white; background: #243451; cursor: pointer; }
button.primary { background: #2563eb; border-color: #60a5fa; }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible { outline: 3px solid #facc15; outline-offset: 2px; }
.close { flex: none; min-width: 48px; }
.confirm { position: absolute; inset: 0; display: grid; place-items: center; background: #050710e8; padding: 20px; }
.confirm[hidden] { display: none; }
.confirm-card { display: grid; gap: 14px; width: min(400px, 100%); padding: 22px; border-radius: 16px; background: #1e293b; border: 1px solid #94a3b8; }
@media (max-width: 600px) {
  /* Browser viewport fullscreen, not browser-chrome fullscreen. Preserve every video pixel. */
  .backdrop { padding: 0; background: #000; }
  .card {
    position: relative; display: block; width: 100%; height: 100vh; height: 100dvh;
    max-height: none; min-height: 0; overflow: hidden;
    border: 0; border-radius: 0; padding: 0; background: #000;
  }
  .head {
    position: absolute; inset: 0 0 auto 0; z-index: 2;
    padding: max(8px, env(safe-area-inset-top)) 12px 8px;
    background: linear-gradient(#000c, transparent);
    pointer-events: none;
  }
  .head .close { pointer-events: auto; }
  .badge { font-size: 10px; text-shadow: 0 1px 3px #000; }
  .card > h2 { display: none; }
  /* Video uses the entire content viewport; letterboxing is only from the source aspect ratio. */
  .video {
    position: absolute; inset: 0; width: 100%; height: 100%;
    min-width: 0; min-height: 0; max-height: none;
    object-fit: contain; background: #000;
  }
  #status {
    position: absolute; z-index: 2; left: 12px; right: 12px;
    bottom: max(78px, calc(env(safe-area-inset-bottom) + 66px));
    padding: 6px 8px; width: fit-content; max-width: calc(100% - 24px);
    border-radius: 6px; background: #000b; color: #fff;
    pointer-events: none; text-shadow: 0 1px 2px #000;
  }
  .card > .actions {
    position: absolute; z-index: 2; left: 0; right: 0; bottom: 0;
    padding: 8px 12px max(12px, env(safe-area-inset-bottom));
    background: transparent; pointer-events: none;
  }
  .card > .actions button { pointer-events: auto; }
  .card > .actions .claim:disabled, .card > .actions .play[hidden] { display: none; }
  .confirm { position: fixed; }
}
`;

export class MockAdOverlay {
  constructor(doc = document) {
    this.doc = doc;
    this.host = doc.createElement('div');
    this.host.hidden = true;
    this.host.setAttribute('data-fiverocks-mock-ad', '');
    const root = this.host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>
      <div class="backdrop">
        <section class="card" role="dialog" aria-modal="true" aria-labelledby="title" aria-describedby="status">
          <div class="head"><span class="badge">FiveRocks · MOCK AD · DEVELOPMENT ONLY</span><button class="close" type="button" aria-label="광고 닫기">✕</button></div>
          <h2 id="title">테스트 광고</h2>
          <video class="video" playsinline muted preload="auto" aria-label="테스트 광고 영상"></video>
          <p id="status" role="status" aria-live="polite">광고를 준비하고 있습니다.</p>
          <div class="actions"><button class="play" type="button" hidden>영상 재생</button><button class="claim primary" type="button" disabled>보상 받기</button></div>
        </section>
        <div class="confirm" hidden><section class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
          <h2 id="confirm-title">광고를 종료할까요?</h2><p id="confirm-message">광고를 닫으면 보상을 받을 수 없습니다. 종료하시겠습니까?</p>
          <div class="actions"><button class="resume primary" type="button">계속 시청</button><button class="quit" type="button">종료하기</button></div>
        </section></div>
      </div>`;
    const get = selector => root.querySelector(selector);
    this.video = get('.video');
    this.status = get('#status');
    this.play = get('.play');
    this.claim = get('.claim');
    this.close = get('.close');
    this.confirm = get('.confirm');
    this.resume = get('.resume');
    this.quit = get('.quit');
    this.previousFocus = null;
    this.previousOverflow = '';
  }
  open() {
    this.previousFocus = this.doc.activeElement;
    this.previousOverflow = this.doc.body.style.overflow;
    this.doc.body.appendChild(this.host);
    this.doc.body.style.overflow = 'hidden';
    this.host.hidden = false;
    this.close.focus();
  }
  hide() {
    this.host.hidden = true;
    this.confirm.hidden = true;
    this.host.remove();
    this.doc.body.style.overflow = this.previousOverflow;
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }
}
