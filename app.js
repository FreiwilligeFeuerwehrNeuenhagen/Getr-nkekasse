const FALLBACK_DRINKS = [
  ['Alkoholfreies Bier', 1, '🍺'],
  ['Budweiser', 1, '🍺'],
  ['Dose', .6, '🥫'],
  ['Krombacher', 1, '🍺'],
  ['Paulaner Spezi', 1, '🥤'],
  ['Porter', 1, '🍺'],
  ['Radeberger', 1, '🍺'],
  ['Radler', 1, '🍺'],
  ['Wasser', .5, '💧']
];
const cfg = window.APP_CONFIG || {};
const online = !!(
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  window.supabase
);
const db = online
  ? window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    )
  : null;
let state = {
  screen: 'users',
  tab: 'drinks',
  drinks: [],
  bookings: [],
  users: [],
  user: null,
  pinSet: false,
  unlocked: false,
  admin: false
};
let modal = null;
let toast = '';
const euro = n =>
  Number(n || 0).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR'
  });
const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
function showToast(text) {
  toast = text;
  render();
  setTimeout(() => {
    toast = '';
    render();
  }, 1800);
}
async function init() {
  if (!online) {
    state.drinks = FALLBACK_DRINKS.map((d, i) => ({
      id: String(i),
      name: d[0],
      price: d[1],
      icon: d[2],
      active: true
    }));
    render();
    return;
  }
  await loadUsers();
  await loadDrinks();
  render();
}
async function loadUsers() {
  const { data, error } = await db
    .from('users')
    .select('*')
    .order('name');
  if (error) {
    console.error(error);
    showToast('Benutzer konnten nicht geladen werden');
    return;
  }
  state.users = data || [];
}
async function loadDrinks() {
  let { data, error } = await db
    .from('drinks')
    .select('*')
    .order('name');
  if (error) {
    console.error(error);
    return;
  }
  state.drinks = data || [];
}
async function loadBookings() {
  if (!state.user) return;
  const { data, error } = await db
    .from('bookings')
    .select('*')
    .eq('user_id', state.user.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  state.bookings = data || [];
}
function balance() {
  return state.bookings
    .filter(b => !b.cancelled_at)
    .reduce((sum, b) => sum + Number(b.price || 0), 0);
}
function appShell(content) {
  return `
    <main class="shell">
      <div class="brand">
        GETRÄNKE<span>KASSE</span>
      </div>
      <div class="subtitle">
        Einfach nehmen. Einfach buchen.
        ${online ? '<span class="online">● synchronisiert</span>' : ''}
      </div>
      ${content}
      ${toast ? `<div class="toast">${esc(toast)}</div>` : ''}
      ${modal || ''}
    </main>
  `;
}
function render() {
  const root = document.querySelector('#app');
  if (!root) return;
  if (state.screen === 'users') {
    root.innerHTML = appShell(userScreen());
    return;
  }
  if (state.screen === 'admin-login') {
    root.innerHTML = appShell(adminLoginScreen());
    return;
  }
  if (state.screen === 'admin') {
    root.innerHTML = appShell(adminScreen());
    return;
  }
  root.innerHTML = appShell(accountApp());
}
function userScreen() {
  const users = state.users
    .map(u => `
      <button class="user-card" onclick="selectUser('${u.id}')">
        ${esc(u.name)}
      </button>
    `)
    .join('');
  return `
    <section class="user-select">
      <h2>Wer bist du?</h2>
      <p class="muted">Wähle deinen Namen aus.</p>
      <input
        id="userSearch"
        class="user-search"
        type="search"
        placeholder="Name suchen …"
        oninput="filterUsers(this.value)"
      >
      <div id="userList" class="user-list">
        ${users || '<p>Keine Benutzer gefunden.</p>'}
      </div>
      <button class="admin-entry" onclick="openAdminLogin()">
        ⚙️ Admin
      </button>
    </section>
  `;
}
function filterUsers(value) {
  const q = value.toLowerCase().trim();
  document.querySelectorAll('.user-card').forEach(el => {
    el.style.display =
      el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
async function selectUser(id) {
  const user = state.users.find(u => String(u.id) === String(id));
  if (!user) return;
  state.user = user;
  state.pinSet = !!user.pin_hash;
  if (state.pinSet) {
    pinDialog(
      'PIN eingeben',
      'Deine vierstellige PIN',
      async pin => {
        const hash = await hashPin(pin);
        if (hash !== user.pin_hash) {
          showToast('PIN ist falsch');
          return false;
        }
        await enterUser();
        return true;
      }
    );
    return;
  }
  await enterUser();
}
async function enterUser() {
  state.screen = 'app';
  state.tab = 'drinks';
  state.unlocked = true;
  modal = null;
  await loadBookings();
  render();
}
function backToUsers() {
  state.screen = 'users';
  state.tab = 'drinks';
  state.user = null;
  state.bookings = [];
  state.unlocked = false;
  modal = null;
  render();
}
function accountApp() {
  const total = balance();
  const drinkCards = state.drinks
    .filter(d => d.active !== false)
    .map(d => `
      <button class="drink" onclick="book('${d.id}')">
        <span class="drink-icon">${esc(d.icon || '🥤')}</span>
        <strong>${esc(d.name)}</strong>
        <b>${euro(d.price)}</b>
      </button>
    `)
    .join('');
  const bookings = state.bookings
    .filter(b => !b.cancelled_at)
    .map(b => `
      <div class="booking-row">
        <div>
          <strong>${esc(b.drink_name || 'Getränk')}</strong>
          <small>${formatDate(b.created_at)}</small>
        </div>
        <div class="booking-price">
          ${euro(b.price)}
          ${canUndo(b)
            ? `<button onclick="undoBooking('${b.id}')">↶</button>`
            : ''
          }
        </div>
      </div>
    `)
    .join('');
  const drinksView = `
    <h2>Hallo ${esc(firstName(state.user?.name))} 👋</h2>
    <div class="drink-grid">
      ${drinkCards}
    </div>
  `;
  const accountView = `
    <h2>Dein Konto</h2>
    <div class="balance-card">
      <small>Offener Betrag</small>
      <strong>${euro(total)}</strong>
    </div>
    <div class="account-actions">
      ${
        state.pinSet
          ? `
            <button onclick="changePin()">PIN ändern</button>
            <button onclick="removePin()">PIN entfernen</button>
          `
          : `
            <button onclick="setPin()">PIN festlegen</button>
          `
      }
    </div>
    <h3>Buchungen</h3>
    <div class="booking-list">
      ${bookings || '<p class="muted">Noch keine Buchungen.</p>'}
    </div>
  `;
  return `
    <div class="app-head">
      <button class="back-button" onclick="backToUsers()">
        ← Zurück
      </button>
    </div>
    ${state.tab === 'drinks' ? drinksView : accountView}
    <nav class="bottom-nav">
      <button
        class="${state.tab === 'drinks' ? 'active' : ''}"
        onclick="setTab('drinks')"
      >
        🥤<span>Getränke</span>
      </button>
      <button
        class="${state.tab === 'account' ? 'active' : ''}"
        onclick="setTab('account')"
      >
        👤<span>Konto</span>
      </button>
    </nav>
  `;
}
function firstName(name) {
  return String(name || '').split(' ')[0];
}
function setTab(tab) {
  state.tab = tab;
  render();
}
async function book(id) {
  if (!state.user) return;
  const drink = state.drinks.find(d => String(d.id) === String(id));
  if (!drink) return;
  if (!online) {
    state.bookings.unshift({
      id: crypto.randomUUID(),
      user_id: state.user.id,
      drink_id: drink.id,
      drink_name: drink.name,
      price: drink.price,
      created_at: new Date().toISOString(),
      cancelled_at: null
    });
    showToast(`${drink.name} gebucht`);
    return;
  }
  const payload = {
    user_id: state.user.id,
    drink_id: drink.id,
    drink_name: drink.name,
    price: drink.price
  };
  const { error } = await db
    .from('bookings')
    .insert(payload);
  if (error) {
    console.error(error);
    showToast('Buchung fehlgeschlagen');
    return;
  }
  await loadBookings();
  showToast(`${drink.name} gebucht`);
}
function canUndo(b) {
  if (!b.created_at || b.cancelled_at) return false;
  return Date.now() - new Date(b.created_at).getTime() <= 5 * 60 * 1000;
}
async function undoBooking(id) {
  if (!online) {
    const b = state.bookings.find(x => String(x.id) === String(id));
    if (b) b.cancelled_at = new Date().toISOString();
    showToast('Buchung storniert');
    return;
  }
  const { error } = await db
    .from('bookings')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error(error);
    showToast('Stornierung fehlgeschlagen');
    return;
  }
  await loadBookings();
  showToast('Buchung storniert');
}
function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}
/* ---------------- PIN ---------------- */
function validPin(pin) {
  return /^\d{4}$/.test(pin);
}
function pinDialog(title, label, callback) {
  window.__pinCallback = callback;
  modal = `
    <div class="modal-wrap">
      <div class="modal">
        <h3>${esc(title)}</h3>
        <p>${esc(label)}</p>
        <input
          id="pinInput"
          class="pin-input"
          type="password"
          inputmode="numeric"
          maxlength="4"
          autocomplete="off"
          placeholder="••••"
        >
        <div class="modal-actions">
          <button class="secondary" onclick="closeModal()">Abbrechen</button>
          <button onclick="submitPin()">OK</button>
        </div>
      </div>
    </div>
  `;
  render();
  setTimeout(() => {
    document.querySelector('#pinInput')?.focus();
  }, 50);
}
async function submitPin() {
  const pin = document.querySelector('#pinInput')?.value || '';
  if (!validPin(pin)) {
    showToast('Bitte vier Ziffern eingeben');
    return;
  }
  if (window.__pinCallback) {
    const close = await window.__pinCallback(pin);
    if (close !== false) {
      modal = null;
      render();
    }
  }
}
function closeModal() {
  modal = null;
  window.__pinCallback = null;
  render();
}
function setPin() {
  pinDialog(
    'PIN festlegen',
    'Neue vierstellige PIN',
    async pin => {
      const pin_hash = await hashPin(pin);
      const { error } = await db
        .from('users')
        .update({ pin_hash })
        .eq('id', state.user.id);
      if (error) {
        console.error(error);
        showToast('PIN konnte nicht gespeichert werden');
        return false;
      }
      state.user.pin_hash = pin_hash;
      state.pinSet = true;
      showToast('PIN gespeichert');
      return true;
    }
  );
}
function changePin() {
  setPin();
}
function removePin() {
  modal = `
    <div class="modal-wrap">
      <div class="modal">
        <h3>PIN entfernen?</h3>
        <p>Das Konto ist danach wieder ohne PIN zugänglich.</p>
        <div class="modal-actions">
          <button class="secondary" onclick="closeModal()">Abbrechen</button>
          <button onclick="confirmRemovePin()">PIN entfernen</button>
        </div>
      </div>
    </div>
  `;
  render();
}
async function confirmRemovePin() {
  const { error } = await db
    .from('users')
    .update({ pin_hash: null })
    .eq('id', state.user.id);
  if (error) {
    console.error(error);
    showToast('PIN konnte nicht entfernt werden');
    return;
  }
  state.user.pin_hash = null;
  state.pinSet = false;
  modal = null;
  showToast('PIN entfernt');
}
/* ---------------- ADMIN ---------------- */
function openAdminLogin() {
  state.screen = 'admin-login';
  render();
}
function adminLoginScreen() {
  return `
    <section class="admin-login">
      <button class="back-button" onclick="backToUsers()">
        ← Zurück
      </button>
      <h2>Admin-Bereich</h2>
      <p class="muted">Admin-PIN eingeben</p>
      <input
        id="adminPin"
        class="pin-input"
        type="password"
        inputmode="numeric"
        maxlength="12"
        placeholder="PIN"
      >
      <button class="admin-login-button" onclick="checkAdminPin()">
        Anmelden
      </button>
    </section>
  `;
}
async function checkAdminPin() {
  const pin = document.querySelector('#adminPin')?.value || '';
  if (!pin) {
    showToast('PIN eingeben');
    return;
  }
  const { data, error } = await db.rpc('check_admin_pin', {
    p_pin: pin
  });
  if (error) {
    console.error(error);
    showToast('Admin-Anmeldung fehlgeschlagen');
    return;
  }
  if (!data) {
    showToast('Admin-PIN ist falsch');
    return;
  }
  state.admin = true;
  state.screen = 'admin';
  await loadUsers();
  await loadDrinks();
  render();
}
function leaveAdmin() {
  state.admin = false;
  state.screen = 'users';
  render();
}
function adminScreen() {
  const users = state.users.map(u => `
    <div class="admin-row">
      <span>${esc(u.name)}</span>
      <div>
        <button onclick="renameUser('${u.id}')">✏️</button>
        <button onclick="resetUserPin('${u.id}')">🔑</button>
      </div>
    </div>
  `).join('');
  const drinks = state.drinks.map(d => `
    <div class="admin-row">
      <div>
        <strong>${esc(d.name)}</strong>
        <small>${euro(d.price)}</small>
      </div>
      <button onclick="editDrink('${d.id}')">✏️</button>
    </div>
  `).join('');
  return `
    <div class="app-head">
      <button class="back-button" onclick="leaveAdmin()">
        ← Admin verlassen
      </button>
    </div>
    <h2>⚙️ Admin</h2>
    <section class="admin-section">
      <div class="admin-section-head">
        <h3>Benutzer</h3>
        <button onclick="addUser()">+ Benutzer</button>
      </div>
      <div class="admin-list">
        ${users}
      </div>
    </section>
    <section class="admin-section">
      <div class="admin-section-head">
        <h3>Getränke</h3>
        <button onclick="addDrink()">+ Getränk</button>
      </div>
      <div class="admin-list">
        ${drinks}
      </div>
    </section>
    <section class="admin-section">
      <div class="admin-section-head">
        <h3>Konten</h3>
      </div>
      <button onclick="showAccounts()">
        Kontostände anzeigen
      </button>
      <div id="adminAccounts"></div>
    </section>
  `;
}
async function addUser() {
  const name = prompt('Name des neuen Benutzers:');
  if (!name?.trim()) return;
  const { error } = await db
    .from('users')
    .insert({ name: name.trim() });
  if (error) {
    console.error(error);
    showToast('Benutzer konnte nicht angelegt werden');
    return;
  }
  await loadUsers();
  showToast('Benutzer angelegt');
}
async function renameUser(id) {
  const user = state.users.find(u => String(u.id) === String(id));
  if (!user) return;
  const name = prompt('Name ändern:', user.name);
  if (!name?.trim()) return;
  const { error } = await db
    .from('users')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) {
    console.error(error);
    showToast('Name konnte nicht geändert werden');
    return;
  }
  await loadUsers();
  showToast('Name geändert');
}
async function resetUserPin(id) {
  if (!confirm('PIN dieses Benutzers wirklich entfernen?')) return;
  const { error } = await db
    .from('users')
    .update({ pin_hash: null })
    .eq('id', id);
  if (error) {
    console.error(error);
    showToast('PIN konnte nicht entfernt werden');
    return;
  }
  await loadUsers();
  showToast('PIN entfernt');
}
async function addDrink() {
  const name = prompt('Name des Getränks:');
  if (!name?.trim()) return;
  const priceText = prompt('Preis, z. B. 1,00:');
  if (!priceText) return;
  const price = Number(priceText.replace(',', '.'));
  if (!Number.isFinite(price)) {
    showToast('Ungültiger Preis');
    return;
  }
  const icon = prompt('Emoji:', '🥤') || '🥤';
  const { error } = await db
    .from('drinks')
    .insert({
      name: name.trim(),
      price,
      icon,
      active: true
    });
  if (error) {
    console.error(error);
    showToast('Getränk konnte nicht angelegt werden');
    return;
  }
  await loadDrinks();
  showToast('Getränk angelegt');
}
async function editDrink(id) {
  const drink = state.drinks.find(d => String(d.id) === String(id));
  if (!drink) return;
  const name = prompt('Getränkename:', drink.name);
  if (!name?.trim()) return;
  const priceText = prompt(
    'Preis:',
    String(drink.price).replace('.', ',')
  );
  if (!priceText) return;
  const price = Number(priceText.replace(',', '.'));
  if (!Number.isFinite(price)) {
    showToast('Ungültiger Preis');
    return;
  }
  const { error } = await db
    .from('drinks')
    .update({
      name: name.trim(),
      price
    })
    .eq('id', id);
  if (error) {
    console.error(error);
    showToast('Getränk konnte nicht geändert werden');
    return;
  }
  await loadDrinks();
  showToast('Getränk geändert');
}
async function showAccounts() {
  const { data, error } = await db
    .from('bookings')
    .select('*');
  if (error) {
    console.error(error);
    showToast('Konten konnten nicht geladen werden');
    return;
  }
  const totals = {};
  (data || [])
    .filter(b => !b.cancelled_at)
    .forEach(b => {
      totals[b.user_id] =
        (totals[b.user_id] || 0) + Number(b.price || 0);
    });
  const html = state.users.map(u => `
    <div class="admin-row">
      <span>${esc(u.name)}</span>
      <strong>${euro(totals[u.id] || 0)}</strong>
    </div>
  `).join('');
  const el = document.querySelector('#adminAccounts');
  if (el) el.innerHTML = html;
}
init();
