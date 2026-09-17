const FALLBACK_DRINKS = [
  ['Alkoholfreies Bier',1,'🍺'],
  ['Budweiser',1,'🍺'],
  ['Dose',.6,'🥫'],
  ['Krombacher',1,'🍺'],
  ['Paulaner Spezi',1,'🥤'],
  ['Porter',1,'🍺'],
  ['Radeberger',1,'🍺'],
  ['Radler',1,'🍺'],
  ['Wasser',.5,'💧']
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
  tab: 'drinks',
  drinks: [],
  bookings: [],
  users: [],
  user: null,
  pinSet: false,
  unlocked: false
};
let modal = null;
let toast = '';
const eur = n =>
  Number(n).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR'
  });
const esc = s =>
  String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[m]));
async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)]
    .map(b => b.toString(16).padStart(2,'0'))
    .join('');
}
async function init() {
  if (!online) {
    state.drinks = FALLBACK_DRINKS.map((d,i) => ({
      id:String(i),
      name:d[0],
      price:d[1],
      icon:d[2]
    }));
    state.bookings = JSON.parse(
      localStorage.getItem('getraenkekasse-offline') || '[]'
    );
    render();
    return;
  }
  try {
    // Alle Benutzer laden
    let {data:users,error:ue} = await db
      .from('users')
      .select('*')
      .order('name');
    if (ue) throw ue;
    state.users = users || [];
    // Getränke laden
    let {data:d,error:de} = await db
      .from('drinks')
      .select('*')
      .eq('active',true)
      .order('sort_order');
    if (de) throw de;
    state.drinks = d || [];
    // Zuletzt gewählten Benutzer wiederherstellen
    const savedUserId = localStorage.getItem(
      'getraenkekasse-user-id'
    );
    if (savedUserId) {
      const savedUser = state.users.find(
        u => u.id === savedUserId
      );
      if (savedUser) {
        state.user = savedUser;
        state.pinSet = !!savedUser.pin_hash;
        // Auf demselben Gerät nach Reload eingeloggt bleiben.
        state.unlocked = true;
        await refreshBookings();
      }
    }
  } catch(e) {
    console.error(e);
    toast = 'Datenbank nicht erreichbar';
  }
  render();
}
async function refreshBookings() {
  if (!online || !state.user) return;
  let {data,error} = await db
    .from('bookings')
    .select('*')
    .eq('user_id',state.user.id)
    .is('cancelled_at',null)
    .order('created_at',{ascending:true});
  if (error) throw error;
  state.bookings = data || [];
}
function renderUserSelection() {
  document.querySelector('#app').innerHTML = `
    <main class="shell">
      <div class="brand">
        GETRÄNKE<span>KASSE</span>
      </div>

      <div class="sub">
        Benutzer auswählen
      </div>

      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
        gap:10px;
        margin-top:24px;
      ">
        ${state.users.map((u,i) => `
          <button
            class="btn secondary"
            style="
              padding:16px;
              text-align:left;
              font-size:16px;
            "
            onclick="selectUser(${i}')"
          >
            ${esc(u.name)}
          </button>
        `).join('')}
      </div>
    </main>
  `;
}

function render() {
  // Noch kein Benutzer gewählt
  if (online && !state.user) {
    renderUserSelection();
    return;
  }
  const total = state.bookings.reduce(
    (s,b) => s + Number(b.price),
    0
  );
  const userName = state.user
    ? state.user.name
    : 'Demo';
  document.querySelector('#app').innerHTML = `
    <main class="shell">
      <div class="brand">
        GETRÄNKE<span>KASSE</span>
      </div>
      <div class="sub">
        Einfach nehmen. Einfach buchen.
        ${
          online
          ? '<span class="sync">● synchronisiert</span>'
          : '<span class="offline">● Demo-Modus</span>'
        }
      </div>
      ${
        state.tab === 'drinks'
        ? `
          <div class="hello" style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:15px;
          ">
            <span>Hallo ${esc(userName)} 👋</span>
            ${
              online
              ? `
                <button
                  onclick="leaveUser()"
                  style="
                    border:0;
                    background:transparent;
                    color:#aeb8c2;
                    font:inherit;
                    font-weight:700;
                    cursor:pointer;
                    padding:8px 0 8px 12px;
                  "
                >
                  ← Zurück
                </button>
              `
              : ''
            }
          </div>
          <div class="grid">
            ${
              state.drinks.map((d,i) => `
                <button
                  class="drink"
                  onclick="askBook(${i})"
                >
                  <div class="icon">${d.icon}</div>
                  <strong>${esc(d.name)}</strong>
                  <div class="price">${eur(d.price)}</div>
                </button>
              `).join('')
            }
          </div>
        `
        : `
          <div style="
            display:flex;
            justify-content:flex-end;
            margin-bottom:10px;
          ">
            ${
              online
              ? `
                <button
                  onclick="leaveUser()"
                  style="
                    border:0;
                    background:transparent;
                    color:#aeb8c2;
                    font:inherit;
                    font-weight:700;
                    cursor:pointer;
                    padding:8px 0 8px 12px;
                  "
                >
                  ← Zurück
                </button>
              `
              : ''
            }
          </div>
          <div class="balance">
            <small>Offener Betrag</small>
            <div class="amount">${eur(total)}</div>
            <div>${esc(userName)}</div>
          </div>
          <div class="section">
            <h2>Buchungen</h2>
            ${
              state.bookings.length
              ? state.bookings
                  .slice()
                  .reverse()
                  .map(b => `
                    <div class="row">
                      <div>
                        <strong>
                          ${esc(b.drink_name || b.name)}
                        </strong>
                        <div class="meta">
                          ${
                            new Date(
                              b.created_at || b.time
                            ).toLocaleString('de-DE')
                          }
                        </div>
                      </div>
                      <div class="rp">
                        ${eur(b.price)}
                      </div>
                    </div>
                  `).join('')
              : `
                <div class="empty">
                  Noch keine Getränke gebucht.
                </div>
              `
            }
          </div>
          <div class="section">
            <h2>Konto</h2>
            <div class="actions">
              ${
                state.pinSet
                ? `
                  <button
                    class="btn secondary"
                    onclick="changePin()"
                  >
                    PIN ändern
                  </button>
                  <button
                    class="btn danger"
                    onclick="removePin()"
                  >
                    PIN entfernen
                  </button>
                `
                : `
                  <button
                    class="btn secondary"
                    onclick="setPin()"
                  >
                    PIN freiwillig festlegen
                  </button>
                `
              }
              ${
                canUndo()
                ? `
                  <button
                    class="btn secondary"
                    onclick="undoLast()"
                  >
                    Letzte Buchung stornieren
                  </button>
                `
                : ''
              }
            </div>
            <div class="tiny">
              Eine Buchung kann bis 5 Minuten danach
              storniert werden.
              ${
                online
                ? 'Buchungen und PIN werden zentral gespeichert.'
                : 'Noch keine Datenbank verbunden.'
              }
            </div>
          </div>
        `
      }
    </main>
    <nav class="nav">
      <div class="navin">
        <button
          class="${state.tab === 'drinks' ? 'active' : ''}"
          onclick="tab('drinks')"
        >
          <b>🥤</b>
          <small>Getränke</small>
        </button>
        <button
          class="${state.tab === 'account' ? 'active' : ''}"
          onclick="tab('account')"
        >
          <b>👤</b>
          <small>Konto</small>
        </button>
      </div>
    </nav>
    ${modal || ''}
    ${
      toast
      ? `<div class="toast">${toast}</div>`
      : ''
    }
  `;
}
function renderUserSelection() {
  document.querySelector('#app').innerHTML = `
    <main class="shell">
      <div class="brand">
        GETRÄNKE<span>KASSE</span>
      </div>
      <div class="sub">
        Einfach nehmen. Einfach buchen.
        <span class="sync">● synchronisiert</span>
      </div>
      <div style="margin-top:25px;margin-bottom:16px">
        <h2 style="margin-bottom:5px">
          Wer bist du?
        </h2>
        <div class="tiny">
          Wähle deinen Namen aus.
        </div>
      </div>
      <div style="
        display:flex;
        flex-direction:column;
        gap:7px;
        padding-bottom:30px;
      ">
        ${
          state.users.map((u,i) => `
            <button
              onclick="selectUser(${i})"
              style="
                width:100%;
                text-align:left;
                padding:15px 16px;
                border-radius:12px;
                border:1px solid rgba(255,255,255,.12);
                background:rgba(255,255,255,.06);
                color:white;
                font:inherit;
                font-weight:600;
                cursor:pointer;
                display:flex;
                justify-content:space-between;
                align-items:center;
              "
            >
              <span>${esc(u.name)}</span>
              <span style="opacity:.45;font-size:20px">›</span>
            </button>
          `).join('')
        }
      </div>
    </main>
    ${modal || ''}
    ${
      toast
      ? `<div class="toast">${toast}</div>`
      : ''
    }
  `;
}
async function selectUser(i) {
  const user = state.users[i];
  if (!user) return;
  // Benutzer besitzt PIN
  if (user.pin_hash) {
    showLoginPin(user);
    return;
  }
  await activateUser(user);
}
function showLoginPin(user) {
  window._loginUser = user;
  modal = `
    <div class="modalwrap">
      <div class="modal">
        <h3>${esc(user.name)}</h3>
        <p>
          Bitte gib deine vierstellige PIN ein.
        </p>
        <div class="pinbox">
          <input
            id="loginpin"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]*"
            placeholder="••••"
          >
        </div>
        <div
          class="actions"
          style="margin-top:16px"
        >
          <button
            class="btn secondary"
            onclick="cancel()"
          >
            Abbrechen
          </button>
          <button
            class="btn"
            onclick="checkLoginPin()"
          >
            Weiter
          </button>
        </div>
      </div>
    </div>
  `;
  renderUserSelection();
  setTimeout(
    () => document.querySelector('#loginpin')?.focus(),
    20
  );
}
async function checkLoginPin() {
  const input = document.querySelector('#loginpin');
  if (!input) return;
  const pin = input.value;
  if (!/^\d{4}$/.test(pin)) {
    flash('Bitte genau 4 Ziffern eingeben');
    return;
  }
  const hash = await hashPin(pin);
  if (hash !== window._loginUser.pin_hash) {
    flash('PIN ist nicht richtig');
    return;
  }
  const user = window._loginUser;
  window._loginUser = null;
  modal = null;
  await activateUser(user);
}
async function activateUser(user) {
  state.user = user;
  state.pinSet = !!user.pin_hash;
  state.unlocked = true;
  state.tab = 'drinks';
  state.bookings = [];
  localStorage.setItem(
    'getraenkekasse-user-id',
    user.id
  );
  try {
    await refreshBookings();
  } catch(e) {
    console.error(e);
    flash('Buchungen konnten nicht geladen werden');
    return;
  }
  render();
}
function leaveUser() {
  // Nur die lokale Benutzerwahl entfernen
  localStorage.removeItem('getraenkekasse-user-id');
  state.user = null;
  state.pinSet = false;
  state.unlocked = false;
  state.bookings = [];
  state.tab = 'drinks';
  modal = null;
  toast = '';
  render();
}
function tab(t) {
  state.tab = t;
  render();
}
function askBook(i) {
  let d = state.drinks[i];
  modal = `
    <div
      class="modalwrap"
      onclick="closeModal(event)"
    >
      <div class="modal">
        <h3>${esc(d.name)} buchen?</h3>
        <p>
          1 × ${esc(d.name)} –
          <strong>${eur(d.price)}</strong>
        </p>
        <div class="actions">
          <button
            class="btn secondary"
            onclick="cancel()"
          >
            Abbrechen
          </button>
          <button
            class="btn"
            onclick="book(${i})"
          >
            Jetzt buchen
          </button>
        </div>
      </div>
    </div>
  `;
  render();
}
function closeModal(e) {
  if (e.target.classList.contains('modalwrap')) {
    cancel();
  }
}
function cancel() {
  modal = null;
  if (state.user) {
    render();
  } else {
    renderUserSelection();
  }
}
async function book(i) {
  let d = state.drinks[i];
  try {
    if (online) {
      let {error} = await db
        .from('bookings')
        .insert({
          user_id:state.user.id,
          drink_id:d.id,
          drink_name:d.name,
          price:d.price
        });
      if (error) throw error;
      await refreshBookings();
    } else {
      state.bookings.push({
        name:d.name,
        price:d.price,
        time:Date.now()
      });
      localStorage.setItem(
        'getraenkekasse-offline',
        JSON.stringify(state.bookings)
      );
    }
    modal = null;
    flash(`${d.name} wurde gebucht ✓`);
  } catch(e) {
    console.error(e);
    flash('Buchung fehlgeschlagen');
  }
}
function flash(t) {
  toast = t;
  if (state.user) {
    render();
  } else {
    renderUserSelection();
  }
  setTimeout(() => {
    toast = '';
    if (state.user) {
      render();
    } else {
      renderUserSelection();
    }
  },1800);
}
function lastTime() {
  let b = state.bookings.at(-1);
  return b
    ? new Date(b.created_at || b.time).getTime()
    : 0;
}
function canUndo() {
  return (
    state.bookings.length &&
    Date.now() - lastTime() < 300000
  );
}
async function undoLast() {
  if (!canUndo()) return;
  let b = state.bookings.at(-1);
  try {
    if (online) {
      let {error} = await db
        .from('bookings')
        .update({
          cancelled_at:new Date().toISOString()
        })
        .eq('id',b.id);
      if (error) throw error;
      await refreshBookings();
    } else {
      state.bookings.pop();
      localStorage.setItem(
        'getraenkekasse-offline',
        JSON.stringify(state.bookings)
      );
    }
    flash(
      `${b.drink_name || b.name} wurde storniert`
    );
  } catch(e) {
    flash('Stornierung fehlgeschlagen');
  }
}
function setPin() {
  pinDialog(
    'PIN festlegen',
    'Speichern',
    savePin
  );
}
function changePin() {
  pinDialog(
    'Neue PIN festlegen',
    'Ändern',
    savePin
  );
}
async function savePin(p) {
  if (!online) {
    state.pinSet = true;
    localStorage.setItem(
      'demo-pin',
      p
    );
    modal = null;
    flash('PIN wurde eingerichtet ✓');
    return;
  }
  let h = await hashPin(p);
  let {error} = await db
    .from('users')
    .update({
      pin_hash:h
    })
    .eq('id',state.user.id);
  if (error) {
    flash('PIN konnte nicht gespeichert werden');
    return;
  }
  state.pinSet = true;
  state.user.pin_hash = h;
  // auch Benutzerliste aktualisieren
  const listUser = state.users.find(
    u => u.id === state.user.id
  );
  if (listUser) {
    listUser.pin_hash = h;
  }
  modal = null;
  flash('PIN wurde gespeichert ✓');
}
function removePin() {
  modal = `
    <div class="modalwrap">
      <div class="modal">
        <h3>PIN entfernen?</h3>
        <p>
          Das Konto ist danach wieder ohne PIN zugänglich.
        </p>
        <div class="actions">
          <button
            class="btn secondary"
            onclick="cancel()"
          >
            Abbrechen
          </button>
          <button
            class="btn danger"
            onclick="confirmRemovePin()"
          >
            PIN entfernen
          </button>
        </div>
      </div>
    </div>
  `;
  render();
}
async function confirmRemovePin() {
  if (online) {
    let {error} = await db
      .from('users')
      .update({
        pin_hash:null
      })
      .eq('id',state.user.id);
    if (error) {
      flash('PIN konnte nicht entfernt werden');
      return;
    }
    state.user.pin_hash = null;
    const listUser = state.users.find(
      u => u.id === state.user.id
    );
    if (listUser) {
      listUser.pin_hash = null;
    }
  } else {
    localStorage.removeItem('demo-pin');
  }
  state.pinSet = false;
  modal = null;
  flash('PIN wurde entfernt');
}
function pinDialog(title,label,cb) {
  window._pinCb = cb;
  modal = `
    <div class="modalwrap">
      <div class="modal">
        <h3>${title}</h3>
        <p>
          Optionaler vierstelliger Zahlencode.
        </p>
        <div class="pinbox">
          <input
            id="pin"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]*"
            placeholder="••••"
          >
        </div>
        <div
          class="actions"
          style="margin-top:16px"
        >
          <button
            class="btn secondary"
            onclick="cancel()"
          >
            Abbrechen
          </button>
          <button
            class="btn"
            onclick="submitPin()"
          >
            ${label}
          </button>
        </div>
      </div>
    </div>
  `;
  render();
  setTimeout(
    () => document.querySelector('#pin')?.focus(),
    20
  );
}
async function submitPin() {
  let p = document.querySelector('#pin').value;
  if (!/^\d{4}$/.test(p)) {
    flash('Bitte genau 4 Ziffern eingeben');
    return;
  }
  await window._pinCb(p);
}
init();
