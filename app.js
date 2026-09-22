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

  users: [],
  drinks: [],
  bookings: [],
  settlements: [],

  adminBookings: [],
  adminSettlements: [],

  user: null,
  pinSet: false,
  admin: false,

  paypalUrl: ''
};

let modal = null;
let toast = '';

/* =========================
   HILFSFUNKTIONEN
========================= */

const euro = value =>
  Number(value || 0).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR'
  });

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

function firstName(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)[0] || '';
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return '?';

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (
    parts[0].charAt(0) +
    parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

function formatDate(value) {
  if (!value) return '';

  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    data
  );

  return [...new Uint8Array(buffer)]
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

/* =========================
   DATEN LADEN
========================= */

async function init() {
  if (!online) {
    state.drinks = FALLBACK_DRINKS.map(
      (drink, index) => ({
        id: String(index),
        name: drink[0],
        price: drink[1],
        icon: drink[2],
        active: true
      })
    );

    render();
    return;
  }

  await Promise.all([
    loadUsers(),
    loadDrinks(),
    loadSettings()
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

async function loadSettings() {
  const { data, error } = await db
    .from('admin_settings')
    .select('paypal_url')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  state.paypalUrl = data?.paypal_url || '';
}

async function loadUserAccount() {
  if (!state.user) return;

  const [bookingsResult, settlementsResult] =
    await Promise.all([
      db
        .from('bookings')
        .select('*')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false }),

      db
        .from('settlements')
        .select('*')
        .eq('user_id', state.user.id)
        .order('settled_at', { ascending: false })
    ]);

  if (bookingsResult.error) {
    console.error(bookingsResult.error);
  } else {
    state.bookings = bookingsResult.data || [];
  }

  if (settlementsResult.error) {
    console.error(settlementsResult.error);
  } else {
    state.settlements = settlementsResult.data || [];
  }
}

async function loadAdminData() {
  const [bookingsResult, settlementsResult] =
    await Promise.all([
      db
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false }),

      db
        .from('settlements')
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
    state.adminSettlements = settlementsResult.data || [];
  }
}

/* =========================
   BERECHNUNGEN
========================= */

function bookingTotal(bookings) {
  return (bookings || [])
    .filter(booking => !booking.cancelled_at)
    .reduce(
      (sum, booking) =>
        sum + Number(booking.price || 0),
      0
    );
}

function paymentTotal(payments) {
  return (payments || []).reduce(
    (sum, payment) =>
      sum + Number(payment.total || 0),
    0
  );
}

function userBalance() {
  return (
    bookingTotal(state.bookings) -
      paymentTotal(state.settlements)
  );
}

function adminBalance(userId) {
  const bookings = state.adminBookings.filter(
    booking =>
      String(booking.user_id) === String(userId)
  );

  const payments = state.adminSettlements.filter(
    payment =>
      String(payment.user_id) === String(userId)
  );

  return (
    bookingTotal(bookings) -
      paymentTotal(payments)
  );
}

/* =========================
   GRUNDLAYOUT
========================= */

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
              ? '<span class="online">● synchronisiert</span>'
              : ''
          }
        </div>
      </header>

      ${content}

      ${
        toast
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
   NAMENSAUSWAHL
========================= */

function userScreen() {
  const users = [...state.users]
    .sort((a, b) =>
      String(a.name).localeCompare(
        String(b.name),
        'de'
      )
    )
    .map(user => `
      <button
        class="person-card"
        data-name="${esc(
          String(user.name).toLowerCase()
        )}"
        onclick="selectUser('${user.id}')"
      >
        <span class="person-initials">
          ${esc(initials(user.name))}
        </span>

        <span class="person-name">
          ${esc(user.name)}
        </span>
      </button>
    `)
    .join('');

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
        ${
          users ||
          '<p class="muted">Keine Benutzer gefunden.</p>'
        }
      </div>

      <button
        class="admin-entry"
        onclick="openAdminLogin()"
      >
        ⚙️ Admin
      </button>

    </section>
  `;
}

function filterUsers(value) {
  const query = String(value || '')
    .toLowerCase()
    .trim();

  document
    .querySelectorAll('.person-card')
    .forEach(card => {
      const name = card.dataset.name || '';

      card.style.display =
        name.includes(query) ? '' : 'none';
    });
}

/* =========================
   BENUTZER ÖFFNEN
========================= */

async function selectUser(id) {
  const user = state.users.find(
    item => String(item.id) === String(id)
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

  await loadUserAccount();
  render();
}

function backToUsers() {
  state.screen = 'users';
  state.tab = 'drinks';
  state.user = null;
  state.bookings = [];
  state.settlements = [];
  modal = null;

  render();
}
/* =========================
   GETRÄNKE + KONTO
========================= */

function accountApp() {
  const total = userBalance();

  const drinks = state.drinks
    .filter(drink => drink.active !== false)
    .map(drink => `
      <button
        class="drink"
        onclick="book('${drink.id}')"
      >
        <span class="drink-icon">
          ${esc(drink.icon || '🥤')}
        </span>

        <strong>${esc(drink.name)}</strong>
        <b>${euro(drink.price)}</b>
      </button>
    `)
    .join('');

  const bookingRows = state.bookings
    .filter(booking => !booking.cancelled_at)
    .map(booking => `
      <div class="booking-row">
        <div>
          <strong>
            ${esc(booking.drink_name || 'Getränk')}
          </strong>

          <small>
            ${formatDate(booking.created_at)}
          </small>
        </div>

        <div class="booking-price">
          ${euro(booking.price)}

          ${
            canUndo(booking)
              ? `
                <button
                  class="undo-button"
                  onclick="undoBooking('${booking.id}')"
                  title="Stornieren"
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

  const paymentRows = state.settlements
    .map(payment => `
      <div class="payment-row">
        <div>
          <strong>Zahlung</strong>

          <small>
            ${formatDate(payment.settled_at)}
            ${
              payment.payment_method
                ? ` · ${esc(payment.payment_method)}`
                : ''
            }
          </small>
        </div>

        <strong>
          − ${euro(payment.total)}
        </strong>
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

        <span class="current-user">
          ${esc(state.user?.name)}
        </span>
      </div>

      <h2>
        Hallo ${esc(firstName(state.user?.name))} 👋
      </h2>

      <p class="muted">
        Was möchtest du buchen?
      </p>

      <div class="drink-grid">
        ${drinks}
      </div>

    </section>
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

        <span class="current-user">
          ${esc(state.user?.name)}
        </span>
      </div>

      <h2>Dein Konto</h2>

     <div class="balance-card ${total < 0 ? 'credit' : ''}">
  <small>
    ${total < 0 ? 'Dein Guthaben' : 'Offener Betrag'}
  </small>

  <strong>
    ${total < 0 ? '+ ' + euro(Math.abs(total)) : euro(total)}
  </strong>
</div>

    ${
  total > 0
    ? `
      <button
        class="paypal-button"
        onclick="openPaypal()"
      >
        <span>Mit PayPal bezahlen</span>
        <strong>${euro(total)}</strong>
      </button>

      <p class="payment-note">
        Auch Teilzahlungen sind möglich.
        Der Admin verbucht die Zahlung anschließend.
      </p>
    `
    : total < 0
      ? `
        <div class="paid-up">
          ✓ Dein Guthaben wird automatisch mit
          zukünftigen Getränken verrechnet.
        </div>
      `
      : `
        <div class="paid-up">
          ✓ Aktuell ist nichts offen.
        </div>
      `
}

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
          bookingRows ||
          '<p class="muted">Noch keine Buchungen.</p>'
        }
      </div>

      ${
        paymentRows
          ? `
            <h3>Zahlungen</h3>
            <div class="payment-list">
              ${paymentRows}
            </div>
          `
          : ''
      }

    </section>
  `;

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
  const url = String(state.paypalUrl || '').trim();

  if (!url) {
    showToast('PayPal-Link ist noch nicht eingerichtet');
    return;
  }

  window.open(
    url,
    '_blank',
    'noopener,noreferrer'
  );
}

/* =========================
   GETRÄNK BUCHEN
========================= */

function book(id) {
  if (!state.user) return;
  const drink = state.drinks.find(
    item => String(item.id) === String(id)
  );
  if (!drink) return;
  modal = `
    <div class="modal-wrap">
      <div class="modal booking-confirm">
        <div class="confirm-icon">
          ${esc(drink.icon || '🥤')}
        </div>
        <h3>${esc(drink.name)} buchen?</h3>
        <div class="confirm-price">
          ${euro(drink.price)}
        </div>
        <p>
          Möchtest du dieses Getränk wirklich buchen?
        </p>
        <div class="modal-actions">
          <button
            class="secondary"
            onclick="closeModal()"
          >
            Abbrechen
          </button>
          <button
            onclick="confirmBooking('${drink.id}')"
          >
            Buchen
          </button>
        </div>
      </div>
    </div>
  `;
  render();
}
async function confirmBooking(id) {
  if (!state.user) return;
  const drink = state.drinks.find(
    item => String(item.id) === String(id)
  );
  if (!drink) return;
  modal = null;
  if (!online) {
    state.bookings.unshift({
      id: crypto.randomUUID(),
      user_id: state.user.id,
      user_name: state.user.name,
      drink_id: drink.id,
      drink_name: drink.name,
      price: drink.price,
      created_at: new Date().toISOString(),
      cancelled_at: null
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
  await loadUserAccount();
  showToast(`${drink.name} gebucht`);
}
function canUndo(booking) {
  if (
    !booking.created_at ||
    booking.cancelled_at
  ) {
    return false;
  }

  return (
    Date.now() -
    new Date(booking.created_at).getTime()
  ) <= 5 * 60 * 1000;
}

async function undoBooking(id) {
  if (!online) {
    const booking = state.bookings.find(
      item => String(item.id) === String(id)
    );

    if (booking) {
      booking.cancelled_at =
        new Date().toISOString();
    }

    showToast('Buchung storniert');
    return;
  }

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

  await loadUserAccount();
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
      window.__pinCallback = null;
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
  if (!online) {
    showToast('PIN ist offline nicht verfügbar');
    return;
  }

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
        onclick="backToUsers()"
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
        autocomplete="off"
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

async function checkAdminPin() {
  const pin =
    document.querySelector('#adminPin')?.value || '';

  if (!pin) {
    showToast('PIN eingeben');
    return;
  }

  const { data, error } = await db.rpc(
    'check_admin_pin',
    { p_pin: pin }
  );

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
  state.adminTab = 'accounts';

  await Promise.all([
    loadUsers(),
    loadDrinks(),
    loadSettings(),
    loadAdminData()
  ]);

  render();
}

function leaveAdmin() {
  state.admin = false;
  state.screen = 'users';
  render();
}
/* =========================
   ADMIN HAUPTBEREICH
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
          class="${state.adminTab === 'payments' ? 'active' : ''}"
          onclick="setAdminTab('payments')"
        >
          Zahlungen
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

        <button
          class="${state.adminTab === 'settings' ? 'active' : ''}"
          onclick="setAdminTab('settings')"
        >
          Einstellungen
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

  if (state.adminTab === 'payments') {
    return adminPayments();
  }

  if (state.adminTab === 'drinks') {
    return adminDrinks();
  }

  if (state.adminTab === 'users') {
    return adminUsers();
  }

  return adminSettings();
}

/* =========================
   ADMIN KONTEN
========================= */

function adminAccounts() {
  const rows = state.users
    .map(user => {
      const open = adminBalance(user.id);

      if (Math.abs(open) < 0.001) {
        return '';
      }

      return `
        <div class="admin-account-card">

          <div>
            <strong>
              ${esc(user.name)}
            </strong>

            <small>
              ${open < 0 ? 'Guthaben' : 'Offener Betrag'}
            </small>
          </div>

          <div class="admin-account-right">

            <strong>
              ${open < 0 ? '+ ' + euro(Math.abs(open)) : euro(open)}
            </strong>
${
  open > 0
    ? `
      <button
        onclick="openPayment('${user.id}')"
      >
        Zahlung
      </button>
    `
    : `
      <span class="credit-label">
        Guthaben
      </span>
    `
}

          </div>

        </div>
      `;
    })
    .join('');

  const total = state.users.reduce(
  (sum, user) => {
    const balance = adminBalance(user.id);
    return sum + Math.max(0, balance);
  },
  0
);

  return `
    <div class="admin-summary">

      <small>
        Insgesamt offen
      </small>

      <strong>
        ${euro(total)}
      </strong>

    </div>

    <div class="admin-list">
      ${
        rows ||
        '<p class="muted">Keine offenen Beträge.</p>'
      }
    </div>
  `;
}

/* =========================
   ZAHLUNG / TEILZAHLUNG
========================= */

function openPayment(userId) {
  const user = state.users.find(
    item =>
      String(item.id) ===
      String(userId)
  );

  if (!user) return;

  const open = adminBalance(userId);

  modal = `
    <div class="modal-wrap">

      <div class="modal">

        <h3>Zahlung erfassen</h3>

        <p>
          ${esc(user.name)}
        </p>

        <div class="payment-open">
          Offen:
          <strong>${euro(open)}</strong>
        </div>

        <label class="field-label">
          Gezahlter Betrag
        </label>

        <input
          id="paymentAmount"
          class="admin-input"
          type="text"
          inputmode="decimal"
          value="${open.toFixed(2).replace('.', ',')}"
        >

        <label class="field-label">
          Zahlungsart
        </label>

        <select
          id="paymentMethod"
          class="admin-input"
        >
          <option value="PayPal">
            PayPal
          </option>

          <option value="Bar">
            Bar
          </option>

          <option value="Überweisung">
            Überweisung
          </option>

          <option value="Sonstiges">
            Sonstiges
          </option>
        </select>

        <label class="field-label">
          Notiz – optional
        </label>

        <input
          id="paymentNote"
          class="admin-input"
          type="text"
          placeholder="z. B. Teilzahlung"
        >

        <div class="modal-actions">

          <button
            class="secondary"
            onclick="closeModal()"
          >
            Abbrechen
          </button>

          <button
            onclick="savePayment('${userId}')"
          >
            Verbuchen
          </button>

        </div>

      </div>

    </div>
  `;

  render();
}

async function savePayment(userId) {
  const amountText =
    document.querySelector('#paymentAmount')?.value || '';

  const amount = Number(
    amountText
      .replace(',', '.')
      .trim()
  );

  const method =
    document.querySelector('#paymentMethod')?.value ||
    'Sonstiges';

  const note =
    document.querySelector('#paymentNote')?.value?.trim() ||
    null;

  const open = adminBalance(userId);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    showToast('Bitte einen gültigen Betrag eingeben');
    return;
  }

  const user = state.users.find(
  item => String(item.id) === String(userId)
);
const { error } = await db
  .from('settlements')
  .insert({
    user_id: userId,
    user_name: user?.name || null,
    total: amount,
    payment_method: method,
    note
  });


  if (error) {
    console.error(error);
    showToast('Zahlung konnte nicht gespeichert werden');
    return;
  }

  modal = null;

  await loadAdminData();

  if (
    state.user &&
    String(state.user.id) === String(userId)
  ) {
    await loadUserAccount();
  }

  showToast(
    amount < open - 0.001
      ? 'Teilzahlung verbucht'
      : 'Vollständig bezahlt'
  );
}

/* =========================
   ZAHLUNGSHISTORIE
========================= */

function adminPayments() {
  if (!state.adminSettlements.length) {
    return `
      <p class="muted">
        Noch keine Zahlungen vorhanden.
      </p>
    `;
  }

  const total = state.adminSettlements.reduce(
    (sum, payment) =>
      sum + Number(payment.total || 0),
    0
  );

  const rows = state.adminSettlements
    .map(payment => {
      const user = state.users.find(
        item =>
          String(item.id) ===
          String(payment.user_id)
      );

      return `
        <div class="admin-payment-row">

          <div>
            <strong>
  ${esc(user?.name || payment.user_name || 'Gelöschter Benutzer')}
</strong>

            <small>
              ${formatDate(payment.settled_at)}
              ·
              ${esc(payment.payment_method || 'Sonstiges')}
            </small>

            ${
              payment.note
                ? `
                  <small>
                    ${esc(payment.note)}
                  </small>
                `
                : ''
            }
          </div>

          <strong>
            ${euro(payment.total)}
          </strong>

        </div>
      `;
    })
    .join('');

  return `
    <div class="admin-summary">
      <small>
        Erfasste Zahlungen
      </small>

      <strong>
        ${euro(total)}
      </strong>
    </div>

    <div class="admin-list">
      ${rows}
    </div>
  `;
}

/* =========================
   ADMIN GETRÄNKE
========================= */

function adminDrinks() {
  const rows = state.drinks
    .map(drink => `
      <div class="admin-row">

        <div>
          <strong>
            ${esc(drink.icon || '🥤')}
            ${esc(drink.name)}
          </strong>

          <small>
            ${euro(drink.price)}
            ·
            ${
              drink.active === false
                ? 'inaktiv'
                : 'aktiv'
            }
          </small>
        </div>

        <div class="admin-row-actions">

          <button
            onclick="editDrink('${drink.id}')"
            title="Bearbeiten"
          >
            ✏️
          </button>

          <button
  onclick="deleteDrink('${drink.id}')"
  title="Getränk löschen"
>
  🗑️
</button>

        </div>

      </div>
    `)
    .join('');

  return `
    <div class="admin-section-head">

      <h3>Getränke</h3>

      <button onclick="addDrink()">
        + Getränk
      </button>

    </div>

    <div class="admin-list">
      ${rows}
    </div>
  `;
}

async function addDrink() {
  const name = prompt(
    'Name des Getränks:'
  );

  if (!name?.trim()) return;

  const priceText = prompt(
    'Preis, z. B. 1,00:'
  );

  if (!priceText) return;

  const price = Number(
    priceText.replace(',', '.')
  );

  if (!Number.isFinite(price)) {
    showToast('Ungültiger Preis');
    return;
  }

  const icon =
    prompt('Emoji:', '🥤') || '🥤';

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
  const drink = state.drinks.find(
    item =>
      String(item.id) === String(id)
  );

  if (!drink) return;

  const name = prompt(
    'Getränkename:',
    drink.name
  );

  if (!name?.trim()) return;

  const priceText = prompt(
    'Preis:',
    String(drink.price).replace('.', ',')
  );

  if (!priceText) return;

  const price = Number(
    priceText.replace(',', '.')
  );

  if (!Number.isFinite(price)) {
    showToast('Ungültiger Preis');
    return;
  }

  const icon =
    prompt(
      'Emoji:',
      drink.icon || '🥤'
    ) || '🥤';

  const { error } = await db
    .from('drinks')
    .update({
      name: name.trim(),
      price,
      icon
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
async function deleteDrink(id) {
  const drink = state.drinks.find(
    item => String(item.id) === String(id)
  );

  if (!drink) return;

  const confirmed = confirm(
    `${drink.name} wirklich löschen?\n\n` +
    `Frühere Buchungen bleiben in der Historie erhalten.`
  );

  if (!confirmed) return;

  const { error } = await db
    .from('drinks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    showToast('Getränk konnte nicht gelöscht werden');
    return;
  }

  await loadDrinks();

  showToast(`${drink.name} gelöscht`);
}

/* =========================
   ADMIN BENUTZER
========================= */

function adminUsers() {
  const rows = state.users
    .map(user => `
      <div class="admin-row">

        <div>
          <strong>
            ${esc(user.name)}
          </strong>

          <small>
            ${
              user.pin_hash
                ? 'PIN eingerichtet'
                : 'Keine PIN'
            }
          </small>
        </div>

        <div class="admin-row-actions">

          <button
            onclick="renameUser('${user.id}')"
            title="Name ändern"
          >
            ✏️
          </button>

          <button
            onclick="resetUserPin('${user.id}')"
            title="PIN entfernen"
          >
            🔑
          </button>
          
          <button
  onclick="deleteUser('${user.id}')"
  title="Benutzer löschen"
>
  🗑️
</button>

        </div>

      </div>
    `)
    .join('');

  return `
    <div class="admin-section-head">

      <h3>Benutzer</h3>

      <button onclick="addUser()">
        + Benutzer
      </button>

    </div>

    <div class="admin-list">
      ${rows}
    </div>
  `;
}

async function addUser() {
  const name = prompt(
    'Name des neuen Benutzers:'
  );

  if (!name?.trim()) return;

  const { error } = await db
    .from('users')
    .insert({
      name: name.trim()
    });

  if (error) {
    console.error(error);
    showToast('Benutzer konnte nicht angelegt werden');
    return;
  }

  await loadUsers();

  showToast('Benutzer angelegt');
}

async function renameUser(id) {
  const user = state.users.find(
    item =>
      String(item.id) === String(id)
  );

  if (!user) return;

  const name = prompt(
    'Name ändern:',
    user.name
  );

  if (!name?.trim()) return;

  const { error } = await db
    .from('users')
    .update({
      name: name.trim()
    })
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
  if (
    !confirm(
      'PIN dieses Benutzers wirklich entfernen?'
    )
  ) {
    return;
  }

  const { error } = await db
    .from('users')
    .update({
      pin_hash: null
    })
    .eq('id', id);

  if (error) {
    console.error(error);
    showToast('PIN konnte nicht entfernt werden');
    return;
  }

  await loadUsers();

  showToast('PIN entfernt');
}
async function deleteUser(id) {
  const user = state.users.find(
    item => String(item.id) === String(id)
  );

  if (!user) return;

  // Aktuellen Kontostand direkt aus der Datenbank prüfen
  const [bookingsResult, settlementsResult] =
    await Promise.all([
      db
        .from('bookings')
        .select('price, cancelled_at')
        .eq('user_id', id),

      db
        .from('settlements')
        .select('total')
        .eq('user_id', id)
    ]);

  if (bookingsResult.error || settlementsResult.error) {
    console.error(
      bookingsResult.error ||
      settlementsResult.error
    );

    showToast('Kontostand konnte nicht geprüft werden');
    return;
  }

  const booked = bookingTotal(
    bookingsResult.data || []
  );

  const paid = paymentTotal(
    settlementsResult.data || []
  );

  const balance = booked - paid;

  // Weder Schulden noch Guthaben dürfen vorhanden sein
  if (Math.abs(balance) >= 0.001) {
    if (balance > 0) {
      showToast(
        `Löschen nicht möglich: ${euro(balance)} offen`
      );
    } else {
      showToast(
        `Löschen nicht möglich: ${euro(Math.abs(balance))} Guthaben`
      );
    }

    return;
  }

  const confirmed = confirm(
    `${user.name} wirklich löschen?\n\n` +
    `Der Kontostand beträgt 0,00 €.`
  );

  if (!confirmed) return;

  const { error } = await db
    .from('users')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    showToast('Benutzer konnte nicht gelöscht werden');
    return;
  }

  await Promise.all([
  loadUsers(),
  loadAdminData()
]);
showToast(`${user.name} gelöscht`);

}

/* =========================
   ADMIN EINSTELLUNGEN
========================= */

function adminSettings() {
  return `
    <div class="settings-card">

      <h3>PayPal</h3>

      <p class="muted">
        Hier kannst du den PayPal-Zahlungslink
        für alle Benutzer ändern.
      </p>

      <label class="field-label">
        PayPal-Zahlungslink
      </label>

      <input
        id="paypalUrl"
        class="admin-input"
        type="url"
        placeholder="https://..."
        value="${esc(state.paypalUrl)}"
      >

      <button
        class="primary-button"
        onclick="savePaypalUrl()"
      >
        PayPal-Link speichern
      </button>

    </div>
  `;
}

async function savePaypalUrl() {
  const url =
    document.querySelector('#paypalUrl')
      ?.value
      ?.trim() || '';

  if (
    url &&
    !/^https?:\/\//i.test(url)
  ) {
    showToast(
      'Bitte einen vollständigen Link eingeben'
    );
    return;
  }

  const { error } = await db
    .from('admin_settings')
    .update({
      paypal_url: url || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1);

  if (error) {
    console.error(error);
    showToast('PayPal-Link konnte nicht gespeichert werden');
    return;
  }

  state.paypalUrl = url;

  showToast('PayPal-Link gespeichert');
}

/* =========================
   START
========================= */

init();
