import { BrowserVoice } from './browserVoice.js';
import { addMedia, listMedia, mediaKind, removeMedia } from './mediaStore.js';
import {
  loadBookingRequests,
  loadProfile,
  normalizeHandle,
  parseLineList,
  parseProjects,
  projectsToText,
  saveBookingRequest,
  saveProfile,
} from './profileStore.js';
import { answerTwin, suggestedQuestions } from './twinBrain.js';

const app = document.querySelector('#robosa-app');
const toast = document.querySelector('#robosa-toast');
const DEFAULT_AVATAR = '/robosa-twin-default.png';
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

const STUDIO_TABS = Object.freeze([
  { id: 'identity', label: 'Identity', icon: 'person' },
  { id: 'knowledge', label: 'Knowledge', icon: 'description' },
  { id: 'appearance', label: 'Appearance', icon: 'photo_camera' },
  { id: 'permissions', label: 'Boundaries', icon: 'shield' },
]);

const state = {
  profile: loadProfile(),
  media: [],
  mediaUrls: new Map(),
  bookings: loadBookingRequests(),
  activeStudioTab: 'identity',
  messages: [],
  pendingReply: false,
  listening: false,
  speaking: false,
  audioEnabled: true,
  selectedSlot: '',
  toastTimer: 0,
};
state.audioEnabled = state.profile.speakReplies;

const voice = new BrowserVoice({
  onTranscript: (transcript) => sendMessage(transcript),
  onListeningChange: (listening) => {
    state.listening = listening;
    updateVoiceUi();
  },
  onSpeakingChange: (speaking) => {
    state.speaking = speaking;
    updateVoiceUi();
  },
  onError: (message) => showToast(message),
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function icon(name) {
  return `<span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(name)}</span>`;
}

function showToast(message) {
  if (!toast) return;
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  state.toastTimer = window.setTimeout(() => {
    toast.classList.remove('visible');
  }, 2600);
}

function mediaUrl(record) {
  if (!record) return '';
  if (!state.mediaUrls.has(record.id)) {
    state.mediaUrls.set(record.id, URL.createObjectURL(record.blob));
  }
  return state.mediaUrls.get(record.id);
}

function avatarUrl() {
  const avatar = state.media.find(
    (record) =>
      record.id === state.profile.avatarMediaId &&
      mediaKind(record) === 'image',
  );
  return avatar ? mediaUrl(avatar) : DEFAULT_AVATAR;
}

function routeFromLocation() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const query = new URLSearchParams(window.location.search);

  if (!path || path === 'robosa.html') {
    const profile = normalizeHandle(query.get('profile'));
    if (profile) return { view: 'profile', handle: profile };
    return {
      view: query.get('view') === 'profile' ? 'profile' : 'studio',
      handle: state.profile.handle,
    };
  }
  if (path === 'studio' || path === 'robosa') {
    return { view: 'studio', handle: state.profile.handle };
  }
  return { view: 'profile', handle: normalizeHandle(path) };
}

function navigateTo(path) {
  window.history.pushState({}, '', path);
  voice.stopSpeaking();
  render();
}

function studioHeader() {
  return `
    <header class="app-header">
      <a class="brand" href="/studio" data-route="studio" aria-label="Robosa twin studio">
        <span class="brand-mark">R</span>
        <span>robosa<span class="brand-domain">.me</span></span>
      </a>
      <div class="header-tabs" role="tablist" aria-label="Robosa views">
        <button class="header-tab" type="button" role="tab" aria-selected="true" data-route="studio">Twin studio</button>
        <button class="header-tab" type="button" role="tab" aria-selected="false" data-route="profile">Public twin</button>
      </div>
      <div class="header-actions">
        <span class="save-state">Saved locally</span>
        <button class="secondary-button" type="button" data-action="copy-link">
          ${icon('content_copy')}<span>Copy link</span>
        </button>
        <button class="primary-button" type="button" data-route="profile">
          <span>Preview</span>${icon('arrow_forward')}
        </button>
      </div>
    </header>`;
}

function studioSidebar() {
  return `
    <aside class="studio-sidebar" aria-label="Twin setup">
      <p class="sidebar-label">Twin setup</p>
      <nav class="studio-nav">
        ${STUDIO_TABS.map(
          (tab) => `
            <button
              class="studio-nav-button"
              type="button"
              data-studio-tab="${tab.id}"
              aria-current="${state.activeStudioTab === tab.id ? 'page' : 'false'}"
            >
              ${icon(tab.icon)}
              <span>${tab.label}</span>
              ${icon('chevron_right')}
            </button>`,
        ).join('')}
      </nav>
      <p class="sidebar-footnote">Prototype data stays in this browser. Nothing is uploaded to a server.</p>
    </aside>`;
}

function identityPanel() {
  return `
    <div class="editor-heading">
      <span class="eyebrow">Identity</span>
      <h1>Shape how your twin introduces you.</h1>
      <p>This is the owner-approved identity visitors see and hear. Keep it direct, specific, and true.</p>
    </div>
    <section class="editor-panel" aria-labelledby="identity-heading">
      <div class="panel-heading">
        <h2 id="identity-heading">Public profile</h2>
        <p>The twin uses these details when someone asks who you are.</p>
      </div>
      <div class="form-grid">
        <label class="form-field">
          <span class="field-label">Display name</span>
          <input name="displayName" data-profile-field="displayName" maxlength="80" value="${escapeHtml(state.profile.displayName)}" />
        </label>
        <label class="form-field">
          <span class="field-label">Public handle</span>
          <span class="handle-input">
            <span>robosa.me/</span>
            <input name="handle" data-profile-field="handle" maxlength="40" value="${escapeHtml(state.profile.handle)}" aria-label="Public handle" />
          </span>
        </label>
        <label class="form-field full">
          <span class="field-label">Headline</span>
          <input name="headline" data-profile-field="headline" maxlength="180" value="${escapeHtml(state.profile.headline)}" />
        </label>
        <label class="form-field full">
          <span class="field-label">Introduction</span>
          <textarea name="bio" data-profile-field="bio" maxlength="900">${escapeHtml(state.profile.bio)}</textarea>
          <span class="field-hint">The twin will not claim feelings, opinions, or experience beyond this approved profile.</span>
        </label>
      </div>
    </section>`;
}

function knowledgePanel() {
  return `
    <div class="editor-heading">
      <span class="eyebrow">Knowledge</span>
      <h1>Give the twin a reliable source of truth.</h1>
      <p>For this prototype, responses come only from the profile, projects, and facts you approve here.</p>
    </div>
    <section class="editor-panel" aria-labelledby="knowledge-heading">
      <div class="panel-heading">
        <h2 id="knowledge-heading">Approved knowledge</h2>
        <p>One project or fact per line keeps the answers predictable.</p>
      </div>
      <div class="form-grid">
        <label class="form-field full">
          <span class="field-label">Projects</span>
          <textarea name="projects" data-profile-field="projects" placeholder="Project name: What it is">${escapeHtml(projectsToText(state.profile.projects))}</textarea>
          <span class="field-hint">Format: project name, colon, then a short description.</span>
        </label>
        <label class="form-field full">
          <span class="field-label">Facts and working preferences</span>
          <textarea name="facts" data-profile-field="facts" placeholder="One approved fact per line">${escapeHtml(state.profile.facts.join('\n'))}</textarea>
        </label>
      </div>
    </section>`;
}

function mediaItem(record) {
  const kind = mediaKind(record);
  const url = mediaUrl(record);
  const isAvatar = state.profile.avatarMediaId === record.id;
  const media =
    kind === 'image'
      ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(record.name)}" />`
      : `<video src="${escapeHtml(url)}" aria-label="${escapeHtml(record.name)}" muted playsinline preload="metadata"></video>`;
  return `
    <article class="media-item" data-media-id="${escapeHtml(record.id)}">
      ${media}
      <div class="media-item-actions">
        ${
          kind === 'image'
            ? `<button class="media-action" type="button" data-action="set-avatar" data-media-id="${escapeHtml(record.id)}" ${isAvatar ? 'disabled' : ''} title="${isAvatar ? 'Current avatar' : 'Use as avatar'}" aria-label="${isAvatar ? 'Current avatar' : `Use ${escapeHtml(record.name)} as avatar`}">${isAvatar ? icon('check') : icon('person')}</button>`
            : `<span class="media-action" title="Speaking video">${icon('video_library')}</span>`
        }
        <button class="media-action" type="button" data-action="remove-media" data-media-id="${escapeHtml(record.id)}" title="Remove" aria-label="Remove ${escapeHtml(record.name)}">${icon('delete')}</button>
      </div>
    </article>`;
}

function appearancePanel() {
  return `
    <div class="editor-heading">
      <span class="eyebrow">Appearance</span>
      <h1>Add the face and source material.</h1>
      <p>Photos can become the public portrait. Speaking videos are stored as future avatar-training material in this prototype.</p>
    </div>
    <section class="editor-panel" aria-labelledby="appearance-heading">
      <div class="panel-heading">
        <h2 id="appearance-heading">Source media</h2>
        <p>Images and video, up to 30 MB each. Stored locally in IndexedDB.</p>
      </div>
      <label class="drop-zone" id="media-drop-zone" for="media-input">
        <span>
          ${icon('upload')}
          <strong>Add photos or speaking videos</strong>
          <small>Choose files or drop them here</small>
        </span>
      </label>
      <input class="media-input" id="media-input" type="file" accept="image/*,video/*" multiple />
      <div class="media-grid" id="media-grid">
        ${state.media.length ? state.media.map(mediaItem).join('') : '<div class="media-empty">No owner media added yet. The synthetic default remains active.</div>'}
      </div>
    </section>`;
}

function bookingRequestList() {
  if (!state.bookings.length) {
    return '<div class="media-empty">No meeting requests yet.</div>';
  }
  return state.bookings
    .slice(-3)
    .reverse()
    .map(
      (booking) => `
        <div class="permission-row">
          <div class="permission-copy">
            <strong>${escapeHtml(booking.guestName || 'Guest')} &middot; ${escapeHtml(booking.slot)}</strong>
            <span>${escapeHtml(booking.guestEmail)} &middot; saved in this browser</span>
          </div>
          ${icon('schedule')}
        </div>`,
    )
    .join('');
}

function permissionsPanel() {
  return `
    <div class="editor-heading">
      <span class="eyebrow">Boundaries</span>
      <h1>Decide what the twin may do.</h1>
      <p>Public conversation and owner actions stay separate. The twin never exposes private calendar details.</p>
    </div>
    <section class="editor-panel" aria-labelledby="permissions-heading">
      <div class="panel-heading">
        <h2 id="permissions-heading">Public permissions</h2>
        <p>These controls apply immediately to the local public preview.</p>
      </div>
      <div class="form-grid">
        <label class="form-field full">
          <span class="field-label">Profile visibility</span>
          <select name="visibility" data-profile-field="visibility">
            <option value="public" ${state.profile.visibility === 'public' ? 'selected' : ''}>Public and discoverable</option>
            <option value="unlisted" ${state.profile.visibility === 'unlisted' ? 'selected' : ''}>Unlisted link</option>
            <option value="private" ${state.profile.visibility === 'private' ? 'selected' : ''}>Private preview</option>
          </select>
        </label>
      </div>
      <div class="permission-list">
        <div class="permission-row">
          <div class="permission-copy">
            <strong>Accept meeting requests</strong>
            <span>Visitors can propose a time without seeing calendar details.</span>
          </div>
          <label class="switch">
            <input type="checkbox" name="allowBooking" data-profile-field="allowBooking" ${state.profile.allowBooking ? 'checked' : ''} aria-label="Accept meeting requests" />
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="permission-row">
          <div class="permission-copy">
            <strong>Speak replies</strong>
            <span>Use the browser's synthetic voice for public answers.</span>
          </div>
          <label class="switch">
            <input type="checkbox" name="speakReplies" data-profile-field="speakReplies" ${state.profile.speakReplies ? 'checked' : ''} aria-label="Speak replies" />
            <span class="switch-track"></span>
          </label>
        </div>
      </div>
    </section>
    <section class="editor-panel" aria-labelledby="requests-heading" style="margin-top: 38px">
      <div class="panel-heading">
        <h2 id="requests-heading">Recent requests</h2>
        <p>${state.bookings.length} saved locally</p>
      </div>
      <div class="permission-list">${bookingRequestList()}</div>
    </section>`;
}

function editorPanel() {
  switch (state.activeStudioTab) {
    case 'knowledge':
      return knowledgePanel();
    case 'appearance':
      return appearancePanel();
    case 'permissions':
      return permissionsPanel();
    default:
      return identityPanel();
  }
}

function twinPreview() {
  return `
    <aside class="preview-column" aria-label="Live twin preview">
      <div class="preview-heading">
        <span class="preview-label">Live preview</span>
        <span class="preview-status">Ready to talk</span>
      </div>
      <div class="twin-preview">
        <div class="preview-avatar-wrap">
          <img class="preview-avatar" data-preview="avatar" src="${escapeHtml(avatarUrl())}" alt="Twin portrait preview" />
          <span class="preview-avatar-badge">AI representative</span>
        </div>
        <div class="preview-copy">
          <span class="section-kicker">Meet the twin</span>
          <h3 data-preview="displayName">${escapeHtml(state.profile.displayName)}</h3>
          <p data-preview="headline">${escapeHtml(state.profile.headline)}</p>
          <button class="primary-button" type="button" data-route="profile">${icon('mic')} Talk to my twin</button>
          <div class="preview-url">
            <span data-preview="url">robosa.me/${escapeHtml(state.profile.handle)}</span>
            ${icon('public')}
          </div>
        </div>
      </div>
    </aside>`;
}

function studioTemplate() {
  return `
    ${studioHeader()}
    <main class="studio-shell">
      ${studioSidebar()}
      <div class="studio-workspace">
        <form class="editor-column" id="studio-form">
          ${editorPanel()}
          <div class="editor-actions">
            <span class="field-hint">Owner-controlled prototype</span>
            <div class="editor-actions-right">
              <button class="secondary-button" type="button" data-action="save-profile">Save changes</button>
              <button class="primary-button" type="button" data-route="profile">Publish preview ${icon('arrow_forward')}</button>
            </div>
          </div>
        </form>
        ${twinPreview()}
      </div>
    </main>`;
}

function publicHeader() {
  return `
    <header class="public-header">
      <a class="brand" href="/studio" data-route="studio" aria-label="Robosa twin studio">
        <span class="brand-mark">R</span>
        <span>robosa<span class="brand-domain">.me</span></span>
      </a>
      <div class="public-header-actions">
        <button class="secondary-button" type="button" data-action="copy-link">${icon('content_copy')}<span>Share twin</span></button>
        <button class="primary-button" type="button" data-route="studio">${icon('add')}<span>Create my twin</span></button>
      </div>
    </header>`;
}

function publicIdentity() {
  return `
    <section class="public-identity" aria-labelledby="public-name">
      <div class="identity-inner">
        <div class="public-avatar-frame ${state.speaking ? 'is-speaking' : ''}" data-speaking-frame>
          <img class="public-avatar" src="${escapeHtml(avatarUrl())}" alt="${escapeHtml(state.profile.displayName)}'s AI representative" />
          <span class="speaking-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        </div>
        <span class="identity-badge">${icon('smart_toy')} AI representative</span>
        <h1 id="public-name">${escapeHtml(state.profile.displayName)}</h1>
        <p class="identity-headline">${escapeHtml(state.profile.headline)}</p>
        <p class="identity-bio">${escapeHtml(state.profile.bio)}</p>
        <div class="identity-actions">
          ${state.profile.allowBooking ? `<button class="primary-button" type="button" data-action="open-booking">${icon('calendar_month')} Request a meeting</button>` : ''}
          <button class="secondary-button" type="button" data-action="ask-work">${icon('auto_awesome')} Ask about my work</button>
        </div>
      </div>
    </section>`;
}

function messageTemplate(message) {
  if (message.role === 'user') {
    return `
      <article class="message user">
        <div class="message-bubble">${escapeHtml(message.text)}</div>
        <span class="message-avatar" aria-hidden="true">${icon('person')}</span>
      </article>`;
  }
  return `
    <article class="message assistant">
      <span class="message-avatar" aria-hidden="true"><img src="${escapeHtml(avatarUrl())}" alt="" /></span>
      <div class="message-bubble">${escapeHtml(message.text)}</div>
    </article>`;
}

function bookingDialog() {
  const slots = [
    'Tuesday, 10:00 AM',
    'Tuesday, 2:30 PM',
    'Wednesday, 11:00 AM',
    'Thursday, 3:00 PM',
  ];
  return `
    <dialog class="booking-dialog" id="booking-dialog">
      <div class="dialog-header">
        <div>
          <span class="section-kicker">Meeting request</span>
          <h2>Talk with ${escapeHtml(state.profile.displayName)}</h2>
        </div>
        <button class="icon-button small" type="button" data-action="close-booking" aria-label="Close meeting request">${icon('close')}</button>
      </div>
      <form class="booking-form" id="booking-form">
        <div>
          <span class="field-label">Choose a proposed time</span>
          <div class="slot-grid" style="margin-top: 8px">
            ${slots
              .map(
                (slot) =>
                  `<button class="slot-button" type="button" data-slot="${escapeHtml(slot)}" aria-pressed="${state.selectedSlot === slot}">${escapeHtml(slot)}</button>`,
              )
              .join('')}
          </div>
        </div>
        <label class="form-field">
          <span class="field-label">Your name</span>
          <input name="guestName" autocomplete="name" required maxlength="100" />
        </label>
        <label class="form-field">
          <span class="field-label">Email</span>
          <input name="guestEmail" type="email" autocomplete="email" required maxlength="180" />
        </label>
        <p class="dialog-note">Prototype only: this request is saved in your browser. No calendar invitation or email is sent.</p>
        <div class="dialog-actions">
          <button class="secondary-button" type="button" data-action="close-booking">Cancel</button>
          <button class="primary-button" type="submit" ${state.selectedSlot ? '' : 'disabled'}>Send request ${icon('arrow_forward')}</button>
        </div>
      </form>
    </dialog>`;
}

function publicConversation() {
  const questions = suggestedQuestions(state.profile);
  return `
    <section class="public-conversation" aria-label="Talk to the twin">
      <div class="conversation-header">
        <div class="conversation-heading">
          <span class="conversation-icon">${icon('graphic_eq')}</span>
          <span>
            <strong>Conversation</strong>
            <span>Answers from owner-approved knowledge</span>
          </span>
        </div>
        <div class="conversation-tools">
          <button class="icon-button small" type="button" data-action="toggle-audio" aria-label="${state.audioEnabled ? 'Mute spoken replies' : 'Enable spoken replies'}" aria-pressed="${state.audioEnabled}">${icon(state.audioEnabled ? 'volume_up' : 'volume_off')}</button>
        </div>
      </div>
      <div class="messages" id="messages" aria-live="polite">
        ${state.messages.map(messageTemplate).join('')}
        ${
          state.pendingReply
            ? `<article class="message assistant"><span class="message-avatar" aria-hidden="true"><img src="${escapeHtml(avatarUrl())}" alt="" /></span><div class="message-bubble typing-bubble" aria-label="Twin is thinking"><i></i><i></i><i></i></div></article>`
            : ''
        }
      </div>
      <div class="suggestions" aria-label="Suggested questions">
        ${questions.map((question) => `<button class="suggestion-chip" type="button" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('')}
      </div>
      <div class="composer-wrap">
        <div class="voice-status ${state.listening ? 'visible' : ''}" id="voice-status"><span class="voice-status-dot"></span><span>Listening. Speak now.</span></div>
        <form class="chat-form" id="chat-form">
          <button class="mic-button" type="button" data-action="toggle-mic" aria-label="${state.listening ? 'Stop listening' : 'Talk to the twin'}" aria-pressed="${state.listening}">${icon(state.listening ? 'mic_off' : 'mic')}</button>
          <input class="chat-input" name="message" autocomplete="off" placeholder="Ask about work, projects, or availability" aria-label="Message for the twin" />
          <button class="send-button" type="submit" aria-label="Send message">${icon('send')}</button>
        </form>
        <p class="disclosure">You are talking to an AI representative, not ${escapeHtml(state.profile.displayName)} directly. Meeting requests are not confirmed until the owner accepts.</p>
      </div>
    </section>`;
}

function publicTemplate() {
  return `
    <main class="public-shell">
      ${publicHeader()}
      <div class="public-grid">
        ${publicIdentity()}
        ${publicConversation()}
      </div>
      ${bookingDialog()}
    </main>`;
}

function notFoundTemplate(handle) {
  return `
    <main class="not-found">
      <div class="not-found-inner">
        <span class="not-found-code">robosa.me/${escapeHtml(handle || 'unknown')}</span>
        <h1>This twin is not here yet.</h1>
        <p>The local prototype currently contains one owner profile. Open the studio to create or rename it.</p>
        <button class="primary-button" type="button" data-route="studio">${icon('arrow_back')} Open twin studio</button>
      </div>
    </main>`;
}

function ensureWelcomeMessage() {
  if (state.messages.length) return;
  state.messages.push({
    role: 'assistant',
    text: `Hi, I am ${state.profile.displayName}'s AI representative. Ask me about the work, current projects, or request a meeting.`,
  });
}

function render() {
  const route = routeFromLocation();
  if (route.view === 'studio') {
    document.title = 'Robosa.me - Digital twin studio';
    app.innerHTML = studioTemplate();
    bindStudioEvents();
    return;
  }

  if (route.handle !== state.profile.handle) {
    document.title = 'Twin not found - Robosa.me';
    app.innerHTML = notFoundTemplate(route.handle);
    bindRouteEvents();
    return;
  }

  ensureWelcomeMessage();
  document.title = `${state.profile.displayName}'s AI twin - Robosa.me`;
  app.innerHTML = publicTemplate();
  bindPublicEvents();
  window.requestAnimationFrame(scrollMessagesToEnd);
}

function bindRouteEvents() {
  document.querySelectorAll('[data-route]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      const route = element.dataset.route;
      navigateTo(route === 'studio' ? '/studio' : `/${state.profile.handle}`);
    });
  });
}

function updateProfileField(element) {
  const field = element.dataset.profileField;
  if (!field) return;
  if (field === 'handle') {
    state.profile.handle = normalizeHandle(element.value) || 'twin';
  } else if (field === 'projects') {
    state.profile.projects = parseProjects(element.value);
  } else if (field === 'facts') {
    state.profile.facts = parseLineList(element.value);
  } else if (element.type === 'checkbox') {
    state.profile[field] = element.checked;
  } else {
    state.profile[field] = element.value;
  }
  state.profile = saveProfile(state.profile);
  state.audioEnabled = state.profile.speakReplies;
  updateStudioPreview();
}

function updateStudioPreview() {
  const name = document.querySelector('[data-preview="displayName"]');
  const headline = document.querySelector('[data-preview="headline"]');
  const url = document.querySelector('[data-preview="url"]');
  if (name) name.textContent = state.profile.displayName;
  if (headline) headline.textContent = state.profile.headline;
  if (url) url.textContent = `robosa.me/${state.profile.handle}`;
}

function bindStudioEvents() {
  bindRouteEvents();

  document.querySelectorAll('[data-studio-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeStudioTab = button.dataset.studioTab;
      render();
    });
  });

  document.querySelectorAll('[data-profile-field]').forEach((element) => {
    const eventName =
      element.type === 'checkbox' || element.tagName === 'SELECT'
        ? 'change'
        : 'input';
    element.addEventListener(eventName, () => updateProfileField(element));
  });

  document
    .querySelectorAll('[data-action="save-profile"]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        state.profile = saveProfile(state.profile);
        showToast('Twin changes saved locally.');
      });
    });

  document.querySelectorAll('[data-action="copy-link"]').forEach((button) => {
    button.addEventListener('click', copyShareLink);
  });

  bindMediaEvents();
}

function bindMediaEvents() {
  const input = document.querySelector('#media-input');
  const dropZone = document.querySelector('#media-drop-zone');
  if (input) {
    input.addEventListener('change', () => handleMediaFiles(input.files));
  }
  if (dropZone) {
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('dragging');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragging');
    });
    dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragging');
      handleMediaFiles(event.dataTransfer?.files);
    });
  }

  document.querySelectorAll('[data-action="set-avatar"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.profile.avatarMediaId = button.dataset.mediaId;
      state.profile = saveProfile(state.profile);
      showToast('Public portrait updated.');
      render();
    });
  });

  document
    .querySelectorAll('[data-action="remove-media"]')
    .forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.mediaId;
        await removeMedia(id);
        const url = state.mediaUrls.get(id);
        if (url) URL.revokeObjectURL(url);
        state.mediaUrls.delete(id);
        state.media = state.media.filter((record) => record.id !== id);
        if (state.profile.avatarMediaId === id) {
          state.profile.avatarMediaId = '';
          state.profile = saveProfile(state.profile);
        }
        showToast('Media removed from this browser.');
        render();
      });
    });
}

async function handleMediaFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  let added = 0;

  for (const file of files) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      showToast(`${file.name} is not an image or video.`);
      continue;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      showToast(`${file.name} is larger than 30 MB.`);
      continue;
    }
    try {
      const record = await addMedia(file);
      state.media.unshift(record);
      if (!state.profile.avatarMediaId && mediaKind(record) === 'image') {
        state.profile.avatarMediaId = record.id;
      }
      added += 1;
    } catch {
      showToast('This browser could not store the selected media.');
    }
  }

  state.profile = saveProfile(state.profile);
  if (added)
    showToast(`${added} media ${added === 1 ? 'item' : 'items'} added.`);
  render();
}

function bindPublicEvents() {
  bindRouteEvents();

  document.querySelectorAll('[data-action="copy-link"]').forEach((button) => {
    button.addEventListener('click', copyShareLink);
  });
  document
    .querySelector('[data-action="toggle-audio"]')
    ?.addEventListener('click', () => {
      state.audioEnabled = !state.audioEnabled;
      if (!state.audioEnabled) voice.stopSpeaking();
      render();
    });
  document
    .querySelector('[data-action="toggle-mic"]')
    ?.addEventListener('click', () => voice.toggleListening());
  document
    .querySelector('[data-action="ask-work"]')
    ?.addEventListener('click', () => sendMessage('What are you building?'));
  document
    .querySelector('[data-action="open-booking"]')
    ?.addEventListener('click', openBookingDialog);
  document
    .querySelectorAll('[data-action="close-booking"]')
    .forEach((button) => {
      button.addEventListener('click', closeBookingDialog);
    });
  document.querySelectorAll('[data-question]').forEach((button) => {
    button.addEventListener('click', () =>
      sendMessage(button.dataset.question),
    );
  });
  document.querySelectorAll('[data-slot]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSlot = button.dataset.slot;
      document.querySelectorAll('[data-slot]').forEach((slotButton) => {
        slotButton.setAttribute(
          'aria-pressed',
          String(slotButton.dataset.slot === state.selectedSlot),
        );
      });
      const submit = document.querySelector('#booking-form [type="submit"]');
      if (submit) submit.disabled = false;
    });
  });

  document.querySelector('#chat-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    sendMessage(form.get('message'));
  });
  document
    .querySelector('#booking-form')
    ?.addEventListener('submit', submitBookingRequest);
}

function updateVoiceUi() {
  document
    .querySelector('#voice-status')
    ?.classList.toggle('visible', state.listening);
  const mic = document.querySelector('[data-action="toggle-mic"]');
  if (mic) {
    mic.setAttribute('aria-pressed', String(state.listening));
    mic.setAttribute(
      'aria-label',
      state.listening ? 'Stop listening' : 'Talk to the twin',
    );
    mic.innerHTML = icon(state.listening ? 'mic_off' : 'mic');
  }
  document
    .querySelector('[data-speaking-frame]')
    ?.classList.toggle('is-speaking', state.speaking);
}

function sendMessage(input) {
  const text = String(input || '').trim();
  if (!text || state.pendingReply) return;
  voice.stopSpeaking();
  state.messages.push({ role: 'user', text });
  state.pendingReply = true;
  render();

  window.setTimeout(() => {
    const response = answerTwin(state.profile, text);
    state.messages.push({ role: 'assistant', text: response.text });
    state.pendingReply = false;
    render();
    if (state.audioEnabled) voice.speak(response.text);
    if (response.action === 'booking') openBookingDialog();
  }, 420);
}

function scrollMessagesToEnd() {
  const messages = document.querySelector('#messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function openBookingDialog() {
  if (!state.profile.allowBooking) return;
  const dialog = document.querySelector('#booking-dialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function closeBookingDialog() {
  document.querySelector('#booking-dialog')?.close();
}

function submitBookingRequest(event) {
  event.preventDefault();
  if (!state.selectedSlot) {
    showToast('Choose a proposed meeting time.');
    return;
  }
  const form = new FormData(event.currentTarget);
  const booking = saveBookingRequest({
    slot: state.selectedSlot,
    guestName: form.get('guestName'),
    guestEmail: form.get('guestEmail'),
  });
  state.bookings = loadBookingRequests();
  state.selectedSlot = '';
  state.messages.push({
    role: 'assistant',
    text: `Your prototype meeting request for ${booking.slot} is saved in this browser. No invitation has been sent yet.`,
  });
  closeBookingDialog();
  render();
  if (state.audioEnabled) {
    voice.speak(
      'Your meeting request is saved. No invitation has been sent yet.',
    );
  }
  showToast('Meeting request saved locally.');
}

async function copyShareLink() {
  const link = `${window.location.origin}/${state.profile.handle}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast(`Copied ${link}`);
  } catch {
    showToast(`Share link: ${link}`);
  }
}

window.addEventListener('popstate', render);
window.addEventListener('beforeunload', () => {
  voice.dispose();
  state.mediaUrls.forEach((url) => URL.revokeObjectURL(url));
});

async function start() {
  try {
    state.media = await listMedia();
  } catch {
    state.media = [];
  }
  render();
}

start();
