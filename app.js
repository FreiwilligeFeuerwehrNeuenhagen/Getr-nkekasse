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
  adminTab: 'accounts',
  drinks: [],
  bookings: [],
  users: [],
  user: null,
  pinSet: false,
  adminUnlocked: false,
  adminBookings: [],
  settlements: []
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
function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (
    parts[0].charAt(0) +
    parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}
function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
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
  await Promise.all([
    loadUsers(),
    loadDrinks()
  ]);
  render();
}
async function loadUsers() {
  const { data, error } = await db
    .from('users')
    .select('*')
    .order('name');
  if (error) {
    console.error(error);
    return;
  }
  state.users = data || [];
}
async function loadDrinks() {
  const { data, error } = await db
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
async function loadAdminData() {
  const [
    bookingsResult,
    settlementsResult
  ] = await Promise.all([
    db.from('bookings')
      .select('*')
      .order('created_at', { ascending: false }),
    db.from('settlements')
      .select('*')
      .order('settled_at', { ascending: false })
  ]);
  if (bookingsResult.error) {
    console.error(bookingsResult.error);
  } else {
    state.adminBookings = bookingsResult.data || [];
  }
  if (settlementsResult.error) {
    console.error(settlementsResult.error);
  } else {
    state.settlements = settlementsResult.data || [];
  }
}
function openBookings(bookings = state.bookings) {
  return bookings.filter(
    b => !b.cancelled_at && !b.settlement_id
  );
}
function balance() {
  return openBookings().reduce(
    (sum, b) => sum + Number(b.price || 0),
    0
  );
}
function appShell(content) {
  return `
    <main class="shell">
      <header class="main-header">
        <div class="main-title">
          GETRÄNKE<span>LISTE</span>
        </div>
        <div class="main-subtitle">
          Freiwillige Feuerwehr Neuenhagen
          ${
            online
              ? '<span class="online-dot">● synchronisiert</span>'
              : ''
          }
        </div>
      </header>
      ${content}
      ${toast
        ? `<div class="toast">${esc(toast)}</div>`
        : ''
      }
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
/* =========================
   BENUTZERAUSWAHL
========================= */
function userScreen() {
  const cards = state.users.map(u => `
    <button
      class="person-card"
      onclick="selectUser('${u.id}')"
      data-name="${esc(u.name.toLowerCase())}"
    >
      <span class="person-initials">
        ${esc(initials(u.name))}
      </span>
      <span class="person-name">
        ${esc(u.name)}
      </span>
    </button>
  `).join('');
  return `
    <section class="user-select">
      <div class="section-heading">
        <h1>Wer bist du?</h1>
        <div class="yellow-line"></div>
      </div>
      <input
        id="userSearch"
        class="user-search"
        type="search"
        placeholder="Name suchen …"
        autocomplete="off"
        oninput="filterUsers(this.value)"
      >
      <div class="person-grid">
        ${cards}
      </div>
    </section>
  `;
}
function filterUsers(value) {
  const q = value.toLowerCase().trim();
  document.querySelectorAll('.person-card').forEach(card => {
    const name = card.dataset.name || '';
    card.style.display =
      name.includes(q) ? '' : 'none';
  });
}
async function selectUser(id) {
  const user = state.users.find(
    u => String(u.id) === String(id)
  );
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
  modal = null;
  await loadBookings();
  render();
}
function backToUsers() {
  state.screen = 'users';
  state.tab = 'drinks';
  state.user = null;
  state.bookings = [];
  state.adminUnlocked = false;
  modal = null;
  render();
}
/* =========================
   NORMALE APP
========================= */
function accountApp() {
  const total = balance();
  const drinkCards = state.drinks
    .filter(d => d.active !== false)
    .map(d => `
      <button
        class="drink"
        onclick="book('${d.id}')"
      >
        <span class="drink-icon">
          ${esc(d.icon || '🥤')}
        </span>
        <strong>${esc(d.name)}</strong>
        <b>${euro(d.price)}</b>
      </button>
    `)
    .join('');
  const bookings = state.bookings
    .filter(b => !b.cancelled_at)
    .map(b => `
      <div class="
        booking-row
        ${b.settlement_id ? 'settled-booking' : ''}
      ">
        <div>
          <strong>
            ${esc(b.drink_name || 'Getränk')}
          </strong>
          <small>
            ${formatDate(b.created_at)}
            ${
              b.settlement_id
                ? ' · bezahlt'
                : ''
            }
          </small>
        </div>
        <div class="booking-price">
          ${euro(b.price)}
          ${
            !b.settlement_id && canUndo(b)
              ? `
                <button
                  class="undo-button"
                  onclick="undoBooking('${b.id}')"
                >
                  ↶
                </button>
              `
              : ''
          }
        </div>
      </div>
    `)
    .join('');
  const drinksView = `
    <section class="app-content">
      <div class="app-topline">
        <button
          class="back-button"
          onclick="backToUsers()"
        >
          ← Zurück
        </button>
        <div class="current-user">
          ${esc(state.user?.name || '')}
        </div>
      </div>
      <h2>
        Hallo ${esc(firstName(state.user?.name))} 👋
      </h2>
      <div class="drink-grid">
        ${drinkCards}
      </div>
    </section>
  `;
  const paypalButton = total > 0
    ? `
      <button
        class="paypal-button"
        onclick="openPaypal()"
      >
        Mit PayPal bezahlen
        <span>${euro(total)}</span>
      </button>
      <p class="payment-note">
        Nach der Zahlung wird der Betrag vom Admin
        als bezahlt markiert.
      </p>
    `
    : `
      <div class="paid-up">
        ✓ Aktuell ist nichts offen.
      </div>
    `;
  const accountView = `
    <section class="app-content">
      <div class="app-topline">
        <button
          class="back-button"
          onclick="backToUsers()"
        >
          ← Zurück
        </button>
        <div class="current-user">
          ${esc(state.user?.name || '')}
        </div>
      </div>
      <h2>Dein Konto</h2>
      <div class="balance-card">
        <small>Offener Betrag</small>
        <strong>${euro(total)}</strong>
      </div>
      ${paypalButton}
      <div class="account-actions">
        ${
          state.pinSet
            ? `
              <button onclick="changePin()">
                PIN ändern
              </button>
              <button onclick="removePin()">
                PIN entfernen
              </button>
            `
            : `
              <button onclick="setPin()">
                PIN festlegen
              </button>
            `
        }
      </div>
      <h3>Buchungen</h3>
      <div class="booking-list">
        ${
          bookings ||
          '<p class="muted">Noch keine Buchungen.</p>'
        }
      </div>
    </section>
  `;
  const isJulien =
    state.user?.name === 'Julien Ehrlich';
  return `
    ${
      state.tab === 'drinks'
        ? drinksView
        : accountView
    }
    <nav class="bottom-nav">
      <button
        class="${state.tab === 'drinks' ? 'active' : ''}"
        onclick="setTab('drinks')"
      >
        <b>🥤</b>
        <span>Getränke</span>
      </button>
      <button
        class="${state.tab === 'account' ? 'active' : ''}"
        onclick="setTab('account')"
      >
        <b>👤</b>
        <span>Konto</span>
      </button>
      ${
        isJulien
          ? `
            <button
              onclick="openAdminLogin()"
            >
              <b>⚙️</b>
              <span>Admin</span>
            </button>
          `
          : ''
      }
    </nav>
  `;
}
function setTab(tab) {
  state.tab = tab;
  render();
}
/* =========================
   PAYPAL
========================= */
function openPaypal() {
  const total = balance();
  if (total <= 0) {
    showToast('Kein offener Betrag');
    return;
  }
  const base = String(cfg.PAYPAL_URL || '').trim();
  if (!base) {
    showToast('PayPal-Link ist noch nicht hinterlegt');
    return;
  }
  let url = base;
  if (/paypal\.me/i.test(base)) {
    url =
      base.replace(/\/+$/, '') +
      '/' +
      total.toFixed(2) +
      'EUR';
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
/* =========================
   BUCHEN
========================= */
async function book(id) {
  if (!state.user) return;
  const drink = state.drinks.find(
    d => String(d.id) === String(id)
  );
  if (!drink) return;
  if (!online) {
    state.bookings.unshift({
      id: crypto.randomUUID(),
      user_id: state.user.id,
      drink_id: drink.id,
      drink_name: drink.name,
      price: drink.price,
      created_at: new Date().toISOString(),
      cancelled_at: null,
      settlement_id: null
    });
    showToast(`${drink.name} gebucht`);
    return;
  }
  const { error } = await db
    .from('bookings')
    .insert({
      user_id: state.user.id,
      drink_id: drink.id,
      drink_name: drink.name,
      price: drink.price
    });
  if (error) {
    console.error(error);
    showToast('Buchung fehlgeschlagen');
    return;
  }
  await loadBookings();
  showToast(`${drink.name} gebucht`);
}
function canUndo(b) {
  if (
    !b.created_at ||
    b.cancelled_at ||
    b.settlement_id
  ) {
    return false;
  }
  return (
    Date.now() -
    new Date(b.created_at).getTime()
  ) <= 5 * 60 * 1000;
}
async function undoBooking(id) {
  const { error } = await db
    .from('bookings')
    .update({
      cancelled_at: new Date().toISOString()
    })
    .eq('id', id);
  if (error) {
    console.error(error);
    showToast('Stornierung fehlgeschlagen');
    return;
  }
  await loadBookings();
  showToast('Buchung storniert');
}
/* =========================
   BENUTZER-PIN
========================= */
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
          <button
            class="secondary"
            onclick="closeModal()"
          >
            Abbrechen
          </button>
          <button onclick="submitPin()">
            OK
          </button>
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
  const pin =
    document.querySelector('#pinInput')?.value || '';
  if (!validPin(pin)) {
    showToast('Bitte vier Ziffern eingeben');
    return;
  }
  if (window.__pinCallback) {
    const close =
      await window.__pinCallback(pin);
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
        <p>
          Das Konto ist danach wieder ohne PIN zugänglich.
        </p>
        <div class="modal-actions">
          <button
            class="secondary"
            onclick="closeModal()"
          >
            Abbrechen
          </button>
          <button onclick="confirmRemovePin()">
            PIN entfernen
          </button>
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
/* =========================
   ADMIN LOGIN
========================= */
function openAdminLogin() {
  state.screen = 'admin-login';
  render();
}
function adminLoginScreen() {
  return `
    <section class="admin-login">
      <button
        class="back-button"
        onclick="returnFromAdminLogin()"
      >
        ← Zurück
      </button>
      <div class="section-heading">
        <h1>Admin</h1>
        <div class="yellow-line"></div>
      </div>
      <p class="muted">
        Admin-PIN eingeben
      </p>
      <input
        id="adminPin"
        class="pin-input"
        type="password"
        inputmode="numeric"
        maxlength="12"
        placeholder="PIN"
      >
      <button
        class="primary-button"
        onclick="checkAdminPin()"
      >
        Anmelden
      </button>
    </section>
  `;
}
function returnFromAdminLogin() {
  state.screen = state.user ? 'app' : 'users';
  render();
}
async function checkAdminPin() {
  const pin =
    document.querySelector('#adminPin')?.value || '';
  if (!pin) {
    showToast('PIN eingeben');
    return;
  }
  const { data, error } =
    await db.rpc('check_admin_pin', {
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
  state.adminUnlocked = true;
  state.screen = 'admin';
  state.adminTab = 'accounts';
  await Promise.all([
    loadUsers(),
    loadDrinks(),
    loadAdminData()
  ]);
  render();
}
function leaveAdmin() {
  state.adminUnlocked = false;
  state.screen = state.user ? 'app' : 'users';
  render();
}
/* =========================
   ADMIN
========================= */
function adminScreen() {
  return `
    <section class="admin-page">
      <div class="app-topline">
        <button
          class="back-button"
          onclick="leaveAdmin()"
        >
          ← Zurück
        </button>
        <strong>Admin</strong>
      </div>
      <div class="admin-tabs">
        <button
          class="${state.adminTab === 'accounts' ? 'active' : ''}"
          onclick="setAdminTab('accounts')"
        >
          Konten
        </button>
        <button
          class="${state.adminTab === 'settlements' ? 'active' : ''}"
          onclick="setAdminTab('settlements')"
        >
          Abrechnungen
        </button>
        <button
          class="${state.adminTab === 'drinks' ? 'active' : ''}"
          onclick="setAdminTab('drinks')"
        >
          Getränke
        </button>
        <button
          class="${state.adminTab === 'users' ? 'active' : ''}"
          onclick="setAdminTab('users')"
        >
          Benutzer
        </button>
      </div>
      ${adminTabContent()}
    </section>
  `;
}
function setAdminTab(tab) {
  state.adminTab = tab;
  render();
}
function adminTabContent() {
  if (state.adminTab === 'accounts') {
    return adminAccounts();
  }
  if (state.adminTab === 'settlements') {
    return adminSettlements();
  }
  if (state.adminTab === 'drinks') {
    return adminDrinks();
  }
  return adminUsers();
}
function adminAccounts() {
  const rows = state.users.map(user => {
    const bookings = state.adminBookings.filter(
      b =>
        String(b.user_id) === String(user.id) &&
        !b.cancelled_at &&
        !b.settlement_id
    );
    const total = bookings.reduce(
      (sum, b) => sum + Number(b.price || 0),
      0
    );
    if (total <= 0) return '';
    return `
      <div class="admin-account-card">
        <div>
          <strong>${esc(user.name)}</strong>
          <small>
            ${bookings.length}
            ${
              bookings.length === 1
                ? 'Buchung'
                : 'Buchungen'
            }
          </small>
        </div>
        <div class="admin-account-right">
          <strong>${euro(total)}</strong>
          <button
            onclick="confirmSettlement('${user.id}')"
          >
            Bezahlt
          </button>
        </div>
      </div>
    `;
  }).join('');
  const grandTotal =
    state.adminBookings
      .filter(
        b =>
          !b.cancelled_at &&
          !b.settlement_id
      )
      .reduce(
        (sum, b) =>
          sum + Number(b.price || 0),
        0
      );
  return `
    <div class="admin-summary">
      <small>Gesamt offen</small>
      <strong>${euro(grandTotal)}</strong>
    </div>
    <div class="admin-list">
      ${
        rows ||
        '<p class="muted">Keine offenen Konten.</p>'
      }
    </div>
  `;
}
function confirmSettlement(userId) {
  const user = state.users.find(
    u => String(u.id) === String(userId)
  );
  if (!user) return;
  const bookings =
    state.adminBookings.filter(
      b =>
        String(b.user_id) === String(userId) &&
        !b.cancelled_at &&
        !b.settlement_id
    );
  const total = bookings.reduce(
    (sum, b) => sum + Number(b.price || 0),
    0
  );
  if (total <= 0) return;
  modal = `
    <div class="modal-wrap">
      <div class="modal">
        <h3>Als bezahlt markieren?</h3>
        <p>
          ${esc(user.name)}<br>
          <strong>${euro(total)}</strong>
        </p>
        <p class="muted">
          ${bookings.length} Buchungen werden
          dieser Abrechnung dauerhaft zugeordnet.
          Die Buchungen werden nicht gelöscht.
        </p>
        <div class="modal-actions">
          <button
            class="secondary"
            onclick="closeModal()"
          >
            Abbrechen
          </button>
          <button
            onclick="settleUser('${userId}')"
          >
            Bezahlt
          </button>
        </div>
      </div>
    </div>
  `;
  render();
}
async function settleUser(userId) {
  const { error } = await db.rpc(
    'settle_user',
    { p_user_id: userId }
  );
  if (error) {
    console.error(error);
    showToast('Abrechnung konnte nicht gespeichert werden');
    return;
  }
  modal = null;
  await loadAdminData();
  if (
    state.user &&
    String(state.user.id) === String(userId)
  ) {
    await loadBookings();
  }
  showToast('Als bezahlt verbucht');
}
function adminSettlements() {
  if (!state.settlements.length) {
    return `
      <p class="muted">
        Noch keine Abrechnungen vorhanden.
      </p>
    `;
  }
  return `
    <div class="settlement-list">
      ${state.settlements.map(s => {
        const user = state.users.find(
          u => String(u.id) === String(s.user_id)
        );
        const items =
          state.adminBookings.filter(
            b =>
              String(b.settlement_id) ===
              String(s.id)
          );
        const summary = {};
        items.forEach(b => {
          const key =
            b.drink_name || 'Getränk';
          if (!summary[key]) {
            summary[key] = {
              count: 0,
              total: 0
            };
          }
          summary[key].count += 1;
          summary[key].total +=
            Number(b.price || 0);
        });
        const details =
          Object.entries(summary)
            .map(([name, info]) => `
              <div class="settlement-item">
                <span>
                  ${info.count} × ${esc(name)}
                </span>
                <strong>
                  ${euro(info.total)}
                </strong>
              </div>
            `)
            .join('');
        return `
          <details class="settlement-card">
            <summary>
              <div>
                <strong>
                  ${esc(user?.name || 'Benutzer
