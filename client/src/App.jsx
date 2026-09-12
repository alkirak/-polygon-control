import { useState, useEffect, useRef } from "react";

/* ---------------- storage helpers (real backend via /api/kv) ---------------- */
const API_BASE = "/api/kv";

async function tryGet(key) {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`);
    if (!res.ok) return null; // 404 = key doesn't exist yet
    const data = await res.json();
    return JSON.parse(data.value);
  } catch (e) {
    return null;
  }
}
async function saveKey(key, value) {
  try {
    await fetch(`${API_BASE}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify(value) }),
    });
  } catch (e) {
    console.error("storage save failed", key, e);
  }
}
async function loadKey(key, fallback) {
  const v = await tryGet(key);
  return v === null || v === undefined ? fallback : v;
}

/* ---------------- generic helpers ---------------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function fmtMoney(n) {
  return Math.round(n || 0).toLocaleString("ru-RU") + " \u20B8";
}
function fmtDateTime(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("ru-RU");
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) { const x = startOfDay(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }
function startOfMonth(d) { const x = startOfDay(d); x.setDate(1); return x; }
function genPin(existing) {
  let p;
  do { p = String(Math.floor(1000 + Math.random() * 9000)); } while (existing.includes(p));
  return p;
}
const AVATAR_PALETTE = ["#A6FF3F", "#5EC8FF", "#FF8A4C", "#B98CFF", "#FF6B9D", "#4DE0C4"];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}
const CATEGORY_COLORS = {
  "Аренда": "#5EC8FF",
  "Электричество": "#FFD24C",
  "Налоги": "#FF6B6B",
  "Зарплата": "#B98CFF",
  "Прочее": "#93A18C",
};

/* ---------------- small reusable UI ---------------- */
function ConfirmButton({ onConfirm, label = "Удалить", small }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={"btn " + (armed ? "btn-danger-armed" : "btn-ghost") + (small ? " btn-sm" : "")}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? "Точно?" : label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/* ================= PIN SCREEN ================= */
function PinScreen({ onSubmit, error }) {
  const [digits, setDigits] = useState([]);
  const shakeTimer = useRef(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (digits.length === 4) {
      onSubmit(digits.join(""));
      setDigits([]);
    }
  }, [digits]);

  useEffect(() => {
    if (error) {
      setShake(true);
      shakeTimer.current = setTimeout(() => setShake(false), 500);
    }
  }, [error]);

  function press(d) {
    if (digits.length >= 4) return;
    setDigits((p) => [...p, d]);
  }
  function backspace() {
    setDigits((p) => p.slice(0, -1));
  }

  const pad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

  return (
    <div className="pin-screen">
      <div className="pin-logo">
        <div className="logo-mark">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 12L12 4L20 12L12 20L4 12Z" stroke="#0A0F0C" strokeWidth="2.2" strokeLinejoin="round" /></svg>
        </div>
        <div className="logo-text">
          <div className="l1">Polygon</div>
          <div className="l2">CONTROL</div>
        </div>
      </div>
      <div className="pin-title">Введите PIN-код</div>
      <div className={"pin-dots" + (shake ? " shake" : "")}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={"pin-dot" + (i < digits.length ? " filled" : "")} />
        ))}
      </div>
      {error ? <div className="pin-error">{error}</div> : <div className="pin-error placeholder">&nbsp;</div>}
      <div className="pin-pad">
        {pad.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : k === "back" ? (
            <button key={i} className="pin-key pin-key-fn" onClick={backspace}>⌫</button>
          ) : (
            <button key={i} className="pin-key" onClick={() => press(k)}>{k}</button>
          )
        )}
      </div>
      <div className="pin-hint">Демо-доступ владельца: <b>1111</b></div>
    </div>
  );
}

/* ================= EMPLOYEE PANEL ================= */
function EmployeePanel({ employee, club, equipment, shifts, updateShifts, issues, updateIssues, purchases, updatePurchases, updateExpenses, onLogout }) {
  const myOpenShift = shifts.find((s) => s.employeeId === employee.id && s.status === "open");
  const [tab, setTab] = useState("shift");

  const [openingCash, setOpeningCash] = useState("");
  const [closing, setClosing] = useState({ senet: "", kaspi: "", cash: "", cashCounted: "" });
  const [salaryTaken, setSalaryTaken] = useState("");
  const [shiftExpenses, setShiftExpenses] = useState([]);
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [closeMode, setCloseMode] = useState(false);

  const [issueTitle, setIssueTitle] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueEquipmentId, setIssueEquipmentId] = useState("");
  const [purchItem, setPurchItem] = useState("");
  const [purchQty, setPurchQty] = useState("");

  const [banner, setBanner] = useState("");

  function flash(msg) {
    setBanner(msg);
    setTimeout(() => setBanner(""), 3000);
  }

  function openShift() {
    const shift = {
      id: uid(),
      clubId: club.id,
      employeeId: employee.id,
      employeeName: employee.name,
      status: "open",
      openedAt: new Date().toISOString(),
      openingCash: parseFloat(openingCash) || 0,
    };
    updateShifts((prev) => [...prev, shift]);
    setOpeningCash("");
    flash("Смена открыта");
  }

  function addShiftExpense() {
    const amt = parseFloat(expAmount) || 0;
    if (!expDesc.trim() || !amt) return;
    setShiftExpenses((p) => [...p, { desc: expDesc.trim(), amount: amt }]);
    setExpDesc("");
    setExpAmount("");
  }
  function removeShiftExpense(i) {
    setShiftExpenses((p) => p.filter((_, idx) => idx !== i));
  }

  const senetR = parseFloat(closing.senet) || 0;
  const kaspiR = parseFloat(closing.kaspi) || 0;
  const cashR = parseFloat(closing.cash) || 0;
  const cashCounted = parseFloat(closing.cashCounted) || 0;
  const expensesSum = shiftExpenses.reduce((a, e) => a + e.amount, 0);
  const salaryAmt = parseFloat(salaryTaken) || 0;
  const expectedCash = (myOpenShift ? myOpenShift.openingCash : 0) + cashR - expensesSum - salaryAmt;
  const discrepancy = cashCounted - expectedCash;

  function closeShift() {
    const closedAt = new Date().toISOString();
    updateShifts((prev) =>
      prev.map((s) =>
        s.id === myOpenShift.id
          ? {
              ...s,
              status: "closed",
              closedAt,
              senetRevenue: senetR,
              kaspiRevenue: kaspiR,
              cashRevenue: cashR,
              cashCounted: cashCounted,
              shiftExpenses,
              salaryTaken: salaryAmt,
              expectedCash,
              discrepancy,
            }
          : s
      )
    );
    if (salaryAmt > 0) {
      updateExpenses((prev) => [
        ...prev,
        {
          id: uid(),
          clubId: club.id,
          category: "Зарплата",
          amount: salaryAmt,
          note: `${employee.name} — забрал(а) при закрытии смены`,
          addedAt: closedAt,
        },
      ]);
    }
    setClosing({ senet: "", kaspi: "", cash: "", cashCounted: "" });
    setSalaryTaken("");
    setShiftExpenses([]);
    setCloseMode(false);
    flash("Смена закрыта");
  }

  function submitIssue() {
    if (!issueTitle.trim()) return;
    const eq = equipment.find((e) => e.id === issueEquipmentId);
    updateIssues((prev) => [
      ...prev,
      {
        id: uid(),
        clubId: club.id,
        employeeId: employee.id,
        employeeName: employee.name,
        title: issueTitle.trim(),
        description: issueDesc.trim(),
        equipmentId: eq ? eq.id : null,
        equipmentLabel: eq ? eq.label : null,
        status: "open",
        createdAt: new Date().toISOString(),
      },
    ]);
    setIssueTitle("");
    setIssueDesc("");
    setIssueEquipmentId("");
    flash("Заявка о неисправности отправлена");
  }

  function submitPurchase() {
    if (!purchItem.trim() || !purchQty) return;
    updatePurchases((prev) => [
      ...prev,
      {
        id: uid(),
        clubId: club.id,
        employeeId: employee.id,
        employeeName: employee.name,
        item: purchItem.trim(),
        qty: purchQty.trim(),
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ]);
    setPurchItem("");
    setPurchQty("");
    flash("Заявка на закупку отправлена");
  }

  const myIssues = issues.filter((i) => i.employeeId === employee.id).slice(-4).reverse();
  const myPurchases = purchases.filter((p) => p.employeeId === employee.id).slice(-4).reverse();

  return (
    <div className="app-shell emp">
      <header className="emp-header">
        <div className="who">
          <div className="avatar" style={{ background: avatarColor(employee.name) }}>{initials(employee.name)}</div>
          <div>
            <div className="emp-name">{employee.name}</div>
            <div className="emp-club">{club ? club.name : "\u2014"}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Выйти</button>
      </header>

      {banner && <div className="banner">{banner}</div>}

      <div className="tabbar">
        <button className={"tab" + (tab === "shift" ? " active" : "")} style={tab === "shift" ? { background: "#A6FF3F22", color: "#A6FF3F" } : undefined} onClick={() => setTab("shift")}>
          <span className="tab-dot" style={{ background: "#A6FF3F" }} />Смена
        </button>
        <button className={"tab" + (tab === "issue" ? " active" : "")} style={tab === "issue" ? { background: "#FF6B6B22", color: "#FF6B6B" } : undefined} onClick={() => setTab("issue")}>
          <span className="tab-dot" style={{ background: "#FF6B6B" }} />Неисправность
        </button>
        <button className={"tab" + (tab === "purchase" ? " active" : "")} style={tab === "purchase" ? { background: "#5EC8FF22", color: "#5EC8FF" } : undefined} onClick={() => setTab("purchase")}>
          <span className="tab-dot" style={{ background: "#5EC8FF" }} />Закупка
        </button>
      </div>

      {tab === "shift" && (
        <div className="card">
          {!myOpenShift && (
            <>
              <h2>Открытие смены</h2>
              <p className="muted">Укажите сумму наличных в кассе на начало смены.</p>
              <Field label="Наличные на начало, ₸">
                <input type="number" inputMode="decimal" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="0" />
              </Field>
              <button className="btn btn-primary btn-block" onClick={openShift}>Открыть смену</button>
            </>
          )}

          {myOpenShift && !closeMode && (
            <>
              <h2>Смена открыта</h2>
              <div className="kv"><span>Начало смены</span><b>{fmtDateTime(myOpenShift.openedAt)}</b></div>
              <div className="kv"><span>Наличные на начало</span><b className="num">{fmtMoney(myOpenShift.openingCash)}</b></div>
              <button className="btn btn-primary btn-block" onClick={() => setCloseMode(true)}>Закрыть смену</button>
            </>
          )}

          {myOpenShift && closeMode && (
            <>
              <h2>Закрытие смены</h2>
              <p className="muted">Введите выручку по способам оплаты за смену.</p>
              <Field label="SENET, ₸">
                <input type="number" inputMode="decimal" value={closing.senet} onChange={(e) => setClosing({ ...closing, senet: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Kaspi Pay, ₸">
                <input type="number" inputMode="decimal" value={closing.kaspi} onChange={(e) => setClosing({ ...closing, kaspi: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Наличные (выручка), ₸">
                <input type="number" inputMode="decimal" value={closing.cash} onChange={(e) => setClosing({ ...closing, cash: e.target.value })} placeholder="0" />
              </Field>

              <div className="subhead">Расходы за смену</div>
              {shiftExpenses.map((e, i) => (
                <div className="kv" key={i}>
                  <span>{e.desc}</span>
                  <span>
                    <b className="num">{fmtMoney(e.amount)}</b>
                    <button className="link-x" onClick={() => removeShiftExpense(i)}>✕</button>
                  </span>
                </div>
              ))}
              <div className="expense-row">
                <input placeholder="Описание (напр. вода)" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} />
                <input type="number" inputMode="decimal" placeholder="Сумма" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
                <button className="btn btn-ghost btn-sm" onClick={addShiftExpense}>+</button>
              </div>

              <div className="subhead">Зарплата наличными</div>
              <Field label="Забрал(а) в счёт зарплаты из кассы, ₸">
                <input type="number" inputMode="decimal" value={salaryTaken} onChange={(e) => setSalaryTaken(e.target.value)} placeholder="0, если не забирали" />
              </Field>

              <div className="subhead">Наличные в кассе на конец</div>
              <Field label="Факт наличных в кассе, ₸">
                <input type="number" inputMode="decimal" value={closing.cashCounted} onChange={(e) => setClosing({ ...closing, cashCounted: e.target.value })} placeholder="0" />
              </Field>

              <div className="reconcile">
                <div className="kv"><span>Ожидается в кассе</span><b className="num">{fmtMoney(expectedCash)}</b></div>
                <div className="kv"><span>Расхождение</span>
                  <b className={"num " + (discrepancy === 0 ? "ok" : "warn")}>
                    {discrepancy > 0 ? "+" : ""}{fmtMoney(discrepancy)}
                  </b>
                </div>
              </div>

              <div className="btn-row">
                <button className="btn btn-ghost btn-block" onClick={() => setCloseMode(false)}>Назад</button>
                <button className="btn btn-primary btn-block" onClick={closeShift}>Подтвердить закрытие</button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "issue" && (
        <div className="card">
          <h2>Сообщить о неисправности</h2>
          {equipment.filter((e) => e.clubId === club.id).length > 0 && (
            <Field label="Какой ПК (необязательно)">
              <select value={issueEquipmentId} onChange={(e) => setIssueEquipmentId(e.target.value)}>
                <option value="">Не привязано к конкретному ПК</option>
                {equipment.filter((e) => e.clubId === club.id).map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Что сломалось">
            <input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="Например: не работает монитор" />
          </Field>
          <Field label="Подробности (необязательно)">
            <textarea rows={3} value={issueDesc} onChange={(e) => setIssueDesc(e.target.value)} placeholder="Опишите проблему" />
          </Field>
          <button className="btn btn-primary btn-block" onClick={submitIssue}>Отправить заявку</button>

          {myIssues.length > 0 && (
            <>
              <div className="subhead">Ваши последние заявки</div>
              {myIssues.map((i) => (
                <div className="list-row" key={i.id}>
                  <div>
                    <div className="lr-title">{i.title}</div>
                    <div className="lr-meta">{i.equipmentLabel ? i.equipmentLabel + " · " : ""}{fmtDateTime(i.createdAt)}</div>
                  </div>
                  <span className={"pill " + (i.status === "open" ? "warn" : "ok")}>{i.status === "open" ? "Открыта" : "Исправлено"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "purchase" && (
        <div className="card">
          <h2>Заявка на закупку</h2>
          <Field label="Что нужно">
            <input value={purchItem} onChange={(e) => setPurchItem(e.target.value)} placeholder="Например: Вода 0,5 л" />
          </Field>
          <Field label="Количество">
            <input value={purchQty} onChange={(e) => setPurchQty(e.target.value)} placeholder="Например: 24 шт." />
          </Field>
          <button className="btn btn-primary btn-block" onClick={submitPurchase}>Отправить заявку</button>

          {myPurchases.length > 0 && (
            <>
              <div className="subhead">Ваши последние заявки</div>
              {myPurchases.map((p) => (
                <div className="list-row" key={p.id}>
                  <div>
                    <div className="lr-title">{p.item} — {p.qty}</div>
                    <div className="lr-meta">{fmtDateTime(p.createdAt)}</div>
                  </div>
                  <span className={"pill " + (p.status === "pending" ? "warn" : "ok")}>{p.status === "pending" ? "Ожидает" : "Доставлено"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { key: "overview", label: "Обзор", color: "#4F8EF7", icon: "home" },
  { key: "clubs", label: "Клубы", color: "#22D3EE", icon: "clubs" },
  { key: "employees", label: "Сотрудники", color: "#B98CFF", icon: "employees" },
  { key: "investors", label: "Инвесторы", color: "#34D399", icon: "investors" },
  { key: "payroll", label: "Зарплата", color: "#FB923C", icon: "payroll" },
  { key: "shifts", label: "Смены", color: "#4DE0C4", icon: "shifts" },
  { key: "equipment", label: "Компьютеры", color: "#38BDF8", icon: "equipment" },
  { key: "expenses", label: "Расходы", color: "#FFD24C", icon: "expenses" },
  { key: "issues", label: "Неисправности", color: "#FF6B6B", icon: "issues" },
  { key: "purchases", label: "Заявки", color: "#FF8A4C", icon: "purchases" },
  { key: "settings", label: "Настройки", color: "#93A0BD", icon: "settings" },
  { key: "activity", label: "Журнал действий", color: "#64748B", icon: "activity" },
];

function NavIcon({ name }) {
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "home": return <svg {...props}><path d="M3 11.5L12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" /></svg>;
    case "clubs": return <svg {...props}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" /></svg>;
    case "employees": return <svg {...props}><circle cx="9" cy="8" r="3" /><path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" /><circle cx="17.5" cy="8.5" r="2.2" /><path d="M15.5 14.5c2.7 0.4 4.5 2.4 4.5 5.5" /></svg>;
    case "investors": return <svg {...props}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
    case "payroll": return <svg {...props}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9h.01M18 15h.01" /></svg>;
    case "shifts": return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case "equipment": return <svg {...props}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></svg>;
    case "expenses": return <svg {...props}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>;
    case "issues": return <svg {...props}><path d="M12 3.5l9 15.5H3z" /><path d="M12 10v4M12 16.5h.01" /></svg>;
    case "purchases": return <svg {...props}><path d="M4 4h2l1 12h11l1-8H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="16" cy="19" r="1.4" /></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V19a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 17.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 6.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1A1.7 1.7 0 0 0 10.13 1.06V1a2 2 0 1 1 4 0v.09c0 .68.4 1.29 1.03 1.56.63.27 1.36.14 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V6.1c.27.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" /></svg>;
    case "activity": return <svg {...props}><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>;
    default: return null;
  }
}

/* ================= INVESTOR PANEL ================= */
function InvestorPanel({ investor, clubs, shifts, expenses, onLogout }) {
  const assignedClubs = clubs.filter((c) => investor.clubIds.includes(c.id));
  const [activeClubId, setActiveClubId] = useState(assignedClubs[0]?.id || null);
  const activeClub = assignedClubs.find((c) => c.id === activeClubId) || assignedClubs[0] || null;

  return (
    <div className="app-shell owner-lite">
      <header className="emp-header">
        <div className="who">
          <div className="avatar" style={{ background: avatarColor(investor.name) }}>{initials(investor.name)}</div>
          <div>
            <div className="emp-name">{investor.name}</div>
            <div className="emp-club">Инвестор</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Выйти</button>
      </header>

      {assignedClubs.length === 0 && (
        <div className="card"><p className="muted" style={{ marginBottom: 0 }}>У вас пока нет доступа ни к одному клубу. Обратитесь к владельцу.</p></div>
      )}

      {assignedClubs.length > 1 && (
        <div className="tabbar" style={{ marginBottom: 18 }}>
          {assignedClubs.map((c) => {
            const color = clubColor(clubs.findIndex((cc) => cc.id === c.id));
            return (
              <button
                key={c.id}
                className={"tab" + (activeClub && activeClub.id === c.id ? " active" : "")}
                style={activeClub && activeClub.id === c.id ? { background: color + "22", color } : undefined}
                onClick={() => setActiveClubId(c.id)}
              >
                <span className="tab-dot" style={{ background: color }} />
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {activeClub && <ClubDetailTab club={activeClub} clubs={clubs} shifts={shifts} expenses={expenses} onBack={null} />}
    </div>
  );
}

/* ================= OWNER DASHBOARD ================= */
function OwnerDashboard({ data, onLogout }) {
  const {
    clubs, updateClubs,
    employees, updateEmployees,
    owners, updateOwners,
    investors, updateInvestors,
    equipment, updateEquipment,
    activityLog, updateActivityLog,
    shifts, updateShifts,
    expenses, updateExpenses,
    issues, updateIssues,
    purchases, updatePurchases,
  } = data;

  const [tab, setTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState(null);
  const selectedClub = clubs.find((c) => c.id === selectedClubId) || null;

  function logAction(text) {
    const actor = (owners[0] && owners[0].name) || "Владелец";
    updateActivityLog((prev) => [...prev, { id: uid(), ts: new Date().toISOString(), actor, text }]);
  }

  function openClub(id) {
    setSelectedClubId(id);
    setTab("clubDetail");
  }

  const active = NAV_ITEMS.find((n) => n.key === tab) || NAV_ITEMS[0];
  const pageTitle = tab === "clubDetail" && selectedClub ? selectedClub.name : active.label;
  const today = new Date();
  const dateStr = today.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const weekdayStr = today.toLocaleDateString("ru-RU", { weekday: "long" });

  return (
    <div className="owner-shell">
      <aside className="owner-sidebar">
        <div className="logo">
          <div className="logo-mark sm">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 12L12 4L20 12L12 20L4 12Z" stroke="#0A0F0C" strokeWidth="2.2" strokeLinejoin="round" /></svg>
          </div>
          <div className="logo-text">
            <div className="l1">Polygon</div>
            <div className="l2">CONTROL</div>
          </div>
        </div>

        <nav className="side-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={"side-nav-item" + (tab === item.key ? " active" : "")}
              style={tab === item.key ? { background: item.color + "1E", color: item.color } : undefined}
              onClick={() => setTab(item.key)}
            >
              <span className="side-nav-ic"><NavIcon name={item.icon} /></span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="foot-dot" />
          <div>
            <div className="foot-t1">Система в порядке</div>
            <div className="foot-t2">Все сервисы работают</div>
          </div>
        </div>
      </aside>

      <main className="owner-main">
        <div className="owner-topbar">
          <div>
            <h1 className="page-title">{pageTitle}</h1>
            <div className="page-sub">{dateStr} · {weekdayStr.charAt(0).toUpperCase() + weekdayStr.slice(1)}</div>
          </div>
          <div className="topbar-right">
            <button className="bell-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M9.5 20a2.5 2.5 0 0 0 5 0" /></svg>
              <span className="bell-dot" />
            </button>
            <button className="who-btn" onClick={() => setMenuOpen((v) => !v)}>
              <span className="avatar" style={{ background: "#4F8EF7" }}>ВЛ</span>
              <span className="who-text">
                <span className="owner-name">Владелец</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {menuOpen && (
              <div className="who-menu">
                <button className="btn btn-ghost btn-sm btn-block" onClick={onLogout}>Выйти</button>
              </div>
            )}
          </div>
        </div>

        <div className="owner-body">
          {tab === "overview" && (
            <OverviewTab
              clubs={clubs}
              employees={employees}
              shifts={shifts}
              expenses={expenses}
              issues={issues}
              purchases={purchases}
              goTo={setTab}
              onOpenClub={openClub}
            />
          )}
          {tab === "clubs" && <ClubsTab clubs={clubs} updateClubs={updateClubs} employees={employees} onOpenClub={openClub} logAction={logAction} />}
          {tab === "employees" && <EmployeesTab clubs={clubs} employees={employees} updateEmployees={updateEmployees} owners={owners} investors={investors} logAction={logAction} />}
          {tab === "investors" && <InvestorsTab clubs={clubs} investors={investors} updateInvestors={updateInvestors} owners={owners} employees={employees} logAction={logAction} />}
          {tab === "payroll" && <PayrollTab clubs={clubs} employees={employees} shifts={shifts} />}
          {tab === "shifts" && <ShiftsTab clubs={clubs} shifts={shifts} />}
          {tab === "equipment" && <EquipmentTab clubs={clubs} equipment={equipment} updateEquipment={updateEquipment} issues={issues} logAction={logAction} />}
          {tab === "expenses" && <ExpensesTab clubs={clubs} expenses={expenses} updateExpenses={updateExpenses} logAction={logAction} />}
          {tab === "issues" && <IssuesTab clubs={clubs} issues={issues} updateIssues={updateIssues} logAction={logAction} />}
          {tab === "purchases" && <PurchasesTab clubs={clubs} purchases={purchases} updatePurchases={updatePurchases} logAction={logAction} />}
          {tab === "settings" && <SettingsTab owners={owners} updateOwners={updateOwners} employees={employees} investors={investors} logAction={logAction} />}
          {tab === "activity" && <ActivityLogTab activityLog={activityLog} />}
          {tab === "clubDetail" && selectedClub && (
            <ClubDetailTab
              club={selectedClub}
              clubs={clubs}
              shifts={shifts}
              expenses={expenses}
              onBack={() => setTab("overview")}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function PeriodPicker({ period, setPeriod }) {
  return (
    <div className="seg">
      {[["day", "Сегодня"], ["week", "Неделя"], ["month", "Месяц"], ["all", "Всё время"]].map(([k, l]) => (
        <button key={k} className={"seg-btn" + (period === k ? " on" : "")} onClick={() => setPeriod(k)}>{l}</button>
      ))}
    </div>
  );
}

const CLUB_PALETTE = ["#8B5CF6", "#22D3EE", "#F472B6", "#F59E0B", "#34D399", "#4F8EF7"];
function clubColor(index) { return CLUB_PALETTE[((index % CLUB_PALETTE.length) + CLUB_PALETTE.length) % CLUB_PALETTE.length]; }

function shiftRevenue(s) { return (s.senetRevenue || 0) + (s.kaspiRevenue || 0) + (s.cashRevenue || 0); }

function RevenueLineChart({ clubs, shifts, clubFilter }) {
  const days = 14;
  const today = startOfDay(new Date());
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); dayList.push(d); }
  const activeClubs = clubFilter === "all" ? clubs : clubs.filter((c) => c.id === clubFilter);

  const series = activeClubs.map((c) => {
    const color = clubColor(clubs.findIndex((cc) => cc.id === c.id));
    const values = dayList.map((d) => {
      const dayEnd = new Date(d); dayEnd.setDate(dayEnd.getDate() + 1);
      return shifts
        .filter((s) => s.status === "closed" && s.clubId === c.id && new Date(s.closedAt) >= d && new Date(s.closedAt) < dayEnd)
        .reduce((a, s) => a + shiftRevenue(s), 0);
    });
    return { club: c, color, values };
  });

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const W = 600, H = 220, pad = 6;
  function pt(i, v) {
    const x = pad + (i / (days - 1)) * (W - 2 * pad);
    const y = H - pad - (v / max) * (H - 2 * pad);
    return [x, y];
  }

  if (series.length === 0) return <p className="muted center pad">Нет клубов для отображения.</p>;

  return (
    <div className="linechart-wrap">
      <div className="linechart-legend">
        {series.map((s, i) => (
          <span className="legend-item" key={i}><span className="legend-dot" style={{ background: s.color }} />{s.club.name}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="linechart-svg" preserveAspectRatio="none">
        <defs>
          {series.map((s, i) => (
            <linearGradient id={`revgrad-${i}`} key={i} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {series.map((s, i) => {
          const pts = s.values.map((v, j) => pt(j, v));
          const linePath = pts.map((p, j) => (j === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
          const areaPath = linePath + ` L${pts[pts.length - 1][0].toFixed(1)},${H - pad} L${pts[0][0].toFixed(1)},${H - pad} Z`;
          return (
            <g key={i}>
              <path d={areaPath} fill={`url(#revgrad-${i})`} stroke="none" />
              <path d={linePath} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <div className="linechart-axis">
        {dayList.filter((_, i) => i % 2 === 0).map((d, i) => (
          <span key={i}>{d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</span>
        ))}
      </div>
    </div>
  );
}

/* ================= MONTH / QUARTER COMPARISON ================= */
function getQuarter(d) { return Math.floor(d.getMonth() / 3); }
function fmtMoneyShort(n) {
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(n) >= 1000) return Math.round(n / 1000) + "K";
  return String(Math.round(n));
}

function PeriodComparisonChart({ shifts, clubFilter }) {
  const [mode, setMode] = useState("month"); // 'month' | 'quarter'
  const now = new Date();
  const count = 6;

  const buckets = [];
  if (mode === "month") {
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d;
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      buckets.push({ start, end, label: start.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }) });
    }
  } else {
    for (let i = count - 1; i >= 0; i--) {
      const totalQuarterIndex = now.getFullYear() * 4 + getQuarter(now) - i;
      const year = Math.floor(totalQuarterIndex / 4);
      const q = totalQuarterIndex % 4;
      const start = new Date(year, q * 3, 1);
      const end = new Date(year, q * 3 + 3, 1);
      buckets.push({ start, end, label: `Q${q + 1} ${String(year).slice(2)}` });
    }
  }

  const values = buckets.map((b) =>
    shifts
      .filter((s) => s.status === "closed" && (clubFilter === "all" || s.clubId === clubFilter) && new Date(s.closedAt) >= b.start && new Date(s.closedAt) < b.end)
      .reduce((a, s) => a + shiftRevenue(s), 0)
  );
  const max = Math.max(1, ...values);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <div className="seg">
          <button className={"seg-btn" + (mode === "month" ? " on" : "")} onClick={() => setMode("month")}>Месяцы</button>
          <button className={"seg-btn" + (mode === "quarter" ? " on" : "")} onClick={() => setMode("quarter")}>Кварталы</button>
        </div>
      </div>
      <div className="bar-chart">
        {buckets.map((b, i) => {
          const h = Math.max(3, (values[i] / max) * 100);
          const isLast = i === buckets.length - 1;
          const prev = i > 0 ? values[i - 1] : null;
          const grew = prev !== null && values[i] >= prev;
          return (
            <div className="bar-col" key={i}>
              <div className="bar-value num">{values[i] > 0 ? fmtMoneyShort(values[i]) : ""}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ height: h + "%", background: isLast ? "#4F8EF7" : (prev === null ? "#2A3652" : grew ? "#34D399" : "#FF6B6B") }} />
              </div>
              <div className="bar-label">{b.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DonutChart({ segments }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 54, C = 2 * Math.PI * R;
  let cumulative = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut-svg">
        <g transform="translate(70,70) rotate(-90)">
          {total === 0 ? (
            <circle r={R} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
          ) : (
            segments.map((s, i) => {
              const frac = s.value / total;
              const dash = frac * C;
              const el = (
                <circle key={i} r={R} fill="none" stroke={s.color} strokeWidth="18"
                  strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-cumulative} />
              );
              cumulative += dash;
              return el;
            })
          )}
        </g>
      </svg>
      <div className="donut-center">
        <div className="donut-total num">{fmtMoney(total)}</div>
        <div className="donut-label">Всего расходов</div>
      </div>
    </div>
  );
}

function StatDelta({ curr, prev, invert }) {
  if (prev === null) return null;
  let pct;
  if (prev === 0) pct = curr === 0 ? 0 : 100;
  else pct = ((curr - prev) / Math.abs(prev)) * 100;
  const goodDirection = invert ? pct <= 0 : pct >= 0;
  return (
    <div className={"stat-delta " + (goodDirection ? "pos" : "neg")}>
      {pct >= 0 ? "↑" : "↓"} {Math.abs(Math.round(pct))}% к пред. периоду
    </div>
  );
}

function OverviewTab({ clubs, employees, shifts, expenses, issues, purchases, goTo, onOpenClub }) {
  const [period, setPeriod] = useState("day");
  const [clubFilter, setClubFilter] = useState("all");

  const now = new Date();
  const cutoff = period === "day" ? startOfDay(now) : period === "week" ? startOfWeek(now) : period === "month" ? startOfMonth(now) : null;

  function inPeriod(iso) {
    if (!cutoff) return true;
    return new Date(iso) >= cutoff;
  }

  const closedShifts = shifts.filter((s) => s.status === "closed" && inPeriod(s.closedAt) && (clubFilter === "all" || s.clubId === clubFilter));
  const periodExpenses = expenses.filter((e) => inPeriod(e.addedAt) && (clubFilter === "all" || e.clubId === clubFilter));

  const revenue = closedShifts.reduce((a, s) => a + shiftRevenue(s), 0);
  const shiftExp = closedShifts.reduce((a, s) => a + (s.shiftExpenses || []).reduce((x, e) => x + e.amount, 0), 0);
  const loggedExp = periodExpenses.reduce((a, e) => a + e.amount, 0);
  const totalExp = shiftExp + loggedExp;
  const profit = revenue - totalExp;

  // previous period, for delta badges
  let prevRange = null;
  if (period === "day") { const s = new Date(cutoff); s.setDate(s.getDate() - 1); prevRange = [s, cutoff]; }
  else if (period === "week") { const s = new Date(cutoff); s.setDate(s.getDate() - 7); prevRange = [s, cutoff]; }
  else if (period === "month") { const s = new Date(cutoff); s.setMonth(s.getMonth() - 1); prevRange = [s, cutoff]; }

  function totalsInRange(range) {
    if (!range) return null;
    const [s, e] = range;
    const cs = shifts.filter((sh) => sh.status === "closed" && (clubFilter === "all" || sh.clubId === clubFilter) && new Date(sh.closedAt) >= s && new Date(sh.closedAt) < e);
    const ex = expenses.filter((ex) => (clubFilter === "all" || ex.clubId === clubFilter) && new Date(ex.addedAt) >= s && new Date(ex.addedAt) < e);
    const rev = cs.reduce((a, sh) => a + shiftRevenue(sh), 0);
    const shEx = cs.reduce((a, sh) => a + (sh.shiftExpenses || []).reduce((x, e2) => x + e2.amount, 0), 0);
    const logEx = ex.reduce((a, e2) => a + e2.amount, 0);
    const exp = shEx + logEx;
    return { revenue: rev, totalExp: exp, profit: rev - exp };
  }
  const prevTotals = totalsInRange(prevRange);

  const openShiftsNow = shifts.filter((s) => s.status === "open");
  const openIssues = issues.filter((i) => i.status === "open").length;
  const pendingPurchases = purchases.filter((p) => p.status === "pending").length;

  const categoryTotals = {};
  EXPENSE_CATEGORIES.forEach((c) => (categoryTotals[c] = 0));
  periodExpenses.forEach((e) => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount; });
  const breakdown = [
    ...EXPENSE_CATEGORIES.map((c) => ({ label: c, value: categoryTotals[c], color: CATEGORY_COLORS[c] })),
    { label: "Мелкие расходы за смену", value: shiftExp, color: "#8B95B3" },
  ].filter((b) => b.value > 0).sort((a, b) => b.value - a.value);

  // club revenue cards: this month vs last month
  const monthStart = startOfMonth(now);
  const nextMonthStart = new Date(monthStart); nextMonthStart.setMonth(nextMonthStart.getMonth() + 1);
  const prevMonthStart = new Date(monthStart); prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  function revenueInRange(clubId, s, e) {
    return shifts.filter((sh) => sh.status === "closed" && sh.clubId === clubId && new Date(sh.closedAt) >= s && new Date(sh.closedAt) < e)
      .reduce((a, sh) => a + shiftRevenue(sh), 0);
  }

  const recentShifts = [...shifts].filter((s) => s.status === "closed" && (clubFilter === "all" || s.clubId === clubFilter))
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)).slice(0, 5);

  return (
    <div>
      <div className="row-between">
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}>
          <option value="all">Все клубы</option>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#4F8EF722", color: "#4F8EF7" }}>₸</span>Выручка</div>
          <div className="stat-value num">{fmtMoney(revenue)}</div>
          {prevTotals && <StatDelta curr={revenue} prev={prevTotals.revenue} />}
        </div>
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#FF8A4C22", color: "#FF8A4C" }}>↓</span>Расходы</div>
          <div className="stat-value num">{fmtMoney(totalExp)}</div>
          {prevTotals && <StatDelta curr={totalExp} prev={prevTotals.totalExp} invert />}
        </div>
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#B98CFF22", color: "#B98CFF" }}>◐</span>Чистая прибыль</div>
          <div className="stat-value num">{fmtMoney(profit)}</div>
          {prevTotals && <StatDelta curr={profit} prev={prevTotals.profit} />}
        </div>
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#22D3EE22", color: "#22D3EE" }}>▤</span>Смен закрыто</div>
          <div className="stat-value num">{closedShifts.length}</div>
        </div>
      </div>

      {(openShiftsNow.length > 0 || openIssues > 0 || pendingPurchases > 0) && (
        <div className="alert-row">
          {openShiftsNow.length > 0 && (
            <button className="alert-chip" style={{ background: "#4DE0C422", color: "#4DE0C4" }} onClick={() => goTo("shifts")}>
              {openShiftsNow.length} смен(ы) сейчас открыто
            </button>
          )}
          {openIssues > 0 && (
            <button className="alert-chip" style={{ background: "#FF6B6B22", color: "#FF6B6B" }} onClick={() => goTo("issues")}>
              {openIssues} неисправност{openIssues === 1 ? "ь" : "и"} не устранено
            </button>
          )}
          {pendingPurchases > 0 && (
            <button className="alert-chip" style={{ background: "#FF8A4C22", color: "#FF8A4C" }} onClick={() => goTo("purchases")}>
              {pendingPurchases} заявк{pendingPurchases === 1 ? "а" : "и"} на закупку ждёт
            </button>
          )}
        </div>
      )}

      <div className="section-card">
        <div className="section-head"><h2>Доход по дням</h2></div>
        <RevenueLineChart clubs={clubs} shifts={shifts} clubFilter={clubFilter} />
      </div>

      <div className="section-card">
        <div className="section-head"><h2>Сравнение по периодам</h2></div>
        <PeriodComparisonChart shifts={shifts} clubFilter={clubFilter} />
      </div>

      {clubs.length > 0 && (
        <div className="section-card">
          <div className="section-head"><h2>Доход по клубам (месяц)</h2></div>
          <div className="club-grid">
            {(clubFilter === "all" ? clubs : clubs.filter((c) => c.id === clubFilter)).map((c) => {
              const idx = clubs.findIndex((cc) => cc.id === c.id);
              const color = clubColor(idx);
              const monthRev = revenueInRange(c.id, monthStart, nextMonthStart);
              const prevMonthRev = revenueInRange(c.id, prevMonthStart, monthStart);
              const todayRev = revenueInRange(c.id, todayStart, tomorrowStart);
              let growth = null;
              if (prevMonthRev > 0) growth = ((monthRev - prevMonthRev) / prevMonthRev) * 100;
              else if (monthRev > 0) growth = 100;
              return (
                <button
                  className="club-card club-card-clickable"
                  key={c.id}
                  style={{ background: `linear-gradient(150deg, ${color}26, ${color}0D)`, borderColor: color + "40" }}
                  onClick={() => onOpenClub(c.id)}
                >
                  <div className="club-card-badge" style={{ background: color }}>{initials(c.name)}</div>
                  <div className="club-card-name" style={{ color }}>{c.name}</div>
                  <div className="club-card-revenue num">{fmtMoney(monthRev)}</div>
                  <div className="club-card-today">Сегодня: <b className="num">{fmtMoney(todayRev)}</b></div>
                  {growth !== null && (
                    <div className={"club-card-growth " + (growth >= 0 ? "pos" : "neg")}>
                      {growth >= 0 ? "↑" : "↓"} {Math.abs(Math.round(growth))}% к прошлому месяцу
                    </div>
                  )}
                  <span className="club-card-arrow">Подробнее →</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="section-card">
        <div className="section-head"><h2>Расходы (за период)</h2></div>
        {breakdown.length === 0 ? (
          <p className="muted center pad">Нет расходов за выбранный период.</p>
        ) : (
          <div className="donut-row">
            <DonutChart segments={breakdown} />
            <div className="donut-legend">
              {breakdown.map((b) => (
                <div className="donut-legend-row" key={b.label}>
                  <span className="donut-legend-label"><span className="cat-dot" style={{ background: b.color }} />{b.label}</span>
                  <b className="num">{fmtMoney(b.value)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="section-card">
        <div className="section-head"><h2>Последние сданные смены</h2>
          <button className="link-btn" onClick={() => goTo("shifts")}>Все смены →</button>
        </div>
        {recentShifts.length === 0 && <p className="muted center pad">Пока нет закрытых смен.</p>}
        {recentShifts.length > 0 && (
          <table>
            <thead><tr><th>Клуб</th><th>Сотрудник</th><th>Время сдачи</th><th>Касса</th><th>Статус</th></tr></thead>
            <tbody>
              {recentShifts.map((s) => {
                const club = clubs.find((c) => c.id === s.clubId);
                return (
                  <tr key={s.id}>
                    <td className="club-name">{club ? club.name : "\u2014"}</td>
                    <td>{s.employeeName}</td>
                    <td>{fmtDateTime(s.closedAt)}</td>
                    <td className="num">{fmtMoney(shiftRevenue(s))}</td>
                    <td><span className="pill ok">Сдана</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ================= CLUB DETAIL ================= */
function ClubDetailTab({ club, clubs, shifts, expenses, onBack }) {
  const [period, setPeriod] = useState("month");
  const color = clubColor(clubs.findIndex((c) => c.id === club.id));

  const now = new Date();
  const cutoff = period === "day" ? startOfDay(now) : period === "week" ? startOfWeek(now) : period === "month" ? startOfMonth(now) : null;
  function inPeriod(iso) { return !cutoff ? true : new Date(iso) >= cutoff; }

  const closedShifts = shifts.filter((s) => s.status === "closed" && s.clubId === club.id && inPeriod(s.closedAt));
  const periodExpenses = expenses.filter((e) => e.clubId === club.id && inPeriod(e.addedAt));

  const revenue = closedShifts.reduce((a, s) => a + shiftRevenue(s), 0);
  const shiftExp = closedShifts.reduce((a, s) => a + (s.shiftExpenses || []).reduce((x, e) => x + e.amount, 0), 0);
  const loggedExp = periodExpenses.reduce((a, e) => a + e.amount, 0);
  const totalExp = shiftExp + loggedExp;
  const profit = revenue - totalExp;

  let prevRange = null;
  if (period === "day") { const s = new Date(cutoff); s.setDate(s.getDate() - 1); prevRange = [s, cutoff]; }
  else if (period === "week") { const s = new Date(cutoff); s.setDate(s.getDate() - 7); prevRange = [s, cutoff]; }
  else if (period === "month") { const s = new Date(cutoff); s.setMonth(s.getMonth() - 1); prevRange = [s, cutoff]; }

  function totalsInRange(range) {
    if (!range) return null;
    const [s, e] = range;
    const cs = shifts.filter((sh) => sh.status === "closed" && sh.clubId === club.id && new Date(sh.closedAt) >= s && new Date(sh.closedAt) < e);
    const ex = expenses.filter((ex) => ex.clubId === club.id && new Date(ex.addedAt) >= s && new Date(ex.addedAt) < e);
    const rev = cs.reduce((a, sh) => a + shiftRevenue(sh), 0);
    const shEx = cs.reduce((a, sh) => a + (sh.shiftExpenses || []).reduce((x, e2) => x + e2.amount, 0), 0);
    const logEx = ex.reduce((a, e2) => a + e2.amount, 0);
    return { revenue: rev, totalExp: shEx + logEx, profit: rev - (shEx + logEx) };
  }
  const prevTotals = totalsInRange(prevRange);

  const categoryTotals = {};
  EXPENSE_CATEGORIES.forEach((c) => (categoryTotals[c] = 0));
  periodExpenses.forEach((e) => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount; });
  const breakdown = [
    ...EXPENSE_CATEGORIES.map((c) => ({ label: c, value: categoryTotals[c], color: CATEGORY_COLORS[c] })),
    { label: "Мелкие расходы за смену", value: shiftExp, color: "#8B95B3" },
  ].filter((b) => b.value > 0).sort((a, b) => b.value - a.value);

  const recentShifts = [...shifts].filter((s) => s.status === "closed" && s.clubId === club.id)
    .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)).slice(0, 8);

  return (
    <div>
      {onBack && <button className="back-btn" onClick={onBack}>← Все клубы</button>}

      <div className="club-detail-head">
        <div className="club-card-badge lg" style={{ background: color }}>{initials(club.name)}</div>
        <div>
          <div className="club-detail-name" style={{ color }}>{club.name}</div>
          <div className="muted" style={{ marginBottom: 0 }}>Экономика клуба</div>
        </div>
      </div>

      <div className="row-between">
        <PeriodPicker period={period} setPeriod={setPeriod} />
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: color + "22", color }}>₸</span>Выручка</div>
          <div className="stat-value num">{fmtMoney(revenue)}</div>
          {prevTotals && <StatDelta curr={revenue} prev={prevTotals.revenue} />}
        </div>
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#FF8A4C22", color: "#FF8A4C" }}>↓</span>Расходы</div>
          <div className="stat-value num">{fmtMoney(totalExp)}</div>
          {prevTotals && <StatDelta curr={totalExp} prev={prevTotals.totalExp} invert />}
        </div>
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#B98CFF22", color: "#B98CFF" }}>◐</span>Чистая прибыль</div>
          <div className="stat-value num">{fmtMoney(profit)}</div>
          {prevTotals && <StatDelta curr={profit} prev={prevTotals.profit} />}
        </div>
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#22D3EE22", color: "#22D3EE" }}>▤</span>Смен закрыто</div>
          <div className="stat-value num">{closedShifts.length}</div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-head"><h2>Доход по дням</h2></div>
        <RevenueLineChart clubs={clubs} shifts={shifts} clubFilter={club.id} />
      </div>

      <div className="section-card">
        <div className="section-head"><h2>Сравнение по периодам</h2></div>
        <PeriodComparisonChart shifts={shifts} clubFilter={club.id} />
      </div>

      <div className="section-card">
        <div className="section-head"><h2>Расходы (за период)</h2></div>
        {breakdown.length === 0 ? (
          <p className="muted center pad">Нет расходов за выбранный период.</p>
        ) : (
          <div className="donut-row">
            <DonutChart segments={breakdown} />
            <div className="donut-legend">
              {breakdown.map((b) => (
                <div className="donut-legend-row" key={b.label}>
                  <span className="donut-legend-label"><span className="cat-dot" style={{ background: b.color }} />{b.label}</span>
                  <b className="num">{fmtMoney(b.value)}</b>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="section-card">
        <div className="section-head"><h2>Смены клуба</h2></div>
        {recentShifts.length === 0 && <p className="muted center pad">Пока нет закрытых смен.</p>}
        {recentShifts.length > 0 && (
          <table>
            <thead><tr><th>Сотрудник</th><th>Время сдачи</th><th>Касса</th><th>Расхождение</th></tr></thead>
            <tbody>
              {recentShifts.map((s) => (
                <tr key={s.id}>
                  <td>{s.employeeName}</td>
                  <td>{fmtDateTime(s.closedAt)}</td>
                  <td className="num">{fmtMoney(shiftRevenue(s))}</td>
                  <td className={"num " + (s.discrepancy === 0 ? "ok" : "warn")}>{fmtMoney(s.discrepancy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ClubsTab({ clubs, updateClubs, employees, onOpenClub, logAction }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  function addClub() {
    if (!name.trim()) return;
    updateClubs((prev) => [...prev, { id: uid(), name: name.trim() }]);
    logAction && logAction(`Добавлен клуб «${name.trim()}»`);
    setName("");
  }
  function startEdit(c) {
    setEditingId(c.id);
    setEditName(c.name);
  }
  function saveEdit() {
    if (!editName.trim()) return;
    const club = clubs.find((c) => c.id === editingId);
    updateClubs((prev) => prev.map((c) => (c.id === editingId ? { ...c, name: editName.trim() } : c)));
    logAction && logAction(`Клуб «${club ? club.name : ""}» переименован в «${editName.trim()}»`);
    setEditingId(null);
  }
  return (
    <div className="section-card">
      <div className="section-head"><h2>Клубы</h2><span className="count">{clubs.length}</span></div>
      {clubs.map((c) =>
        editingId === c.id ? (
          <div className="list-row" key={c.id}>
            <div className="edit-row">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>Сохранить</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Отмена</button>
            </div>
          </div>
        ) : (
          <div className="list-row" key={c.id}>
            <button className="lr-clickable" onClick={() => onOpenClub(c.id)}>
              <div className="lr-title">{c.name}</div>
              <div className="lr-meta">{employees.filter((e) => e.clubId === c.id).length} сотрудник(ов) · экономика клуба →</div>
            </button>
            <div className="row-align">
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Изменить</button>
              <ConfirmButton small onConfirm={() => { updateClubs((prev) => prev.filter((x) => x.id !== c.id)); logAction && logAction(`Удалён клуб «${c.name}»`); }} />
            </div>
          </div>
        )
      )}
      <div className="add-row">
        <input placeholder="Название клуба" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={addClub}>Добавить</button>
      </div>
    </div>
  );
}

function EmployeesTab({ clubs, employees, updateEmployees, owners, investors, logAction }) {
  const [name, setName] = useState("");
  const [clubId, setClubId] = useState(clubs[0]?.id || "");
  const [pin, setPin] = useState("");
  const [payType, setPayType] = useState("perShift");
  const [rate, setRate] = useState("");
  const [lastCreated, setLastCreated] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editClubId, setEditClubId] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editPayType, setEditPayType] = useState("perShift");
  const [editRate, setEditRate] = useState("");
  const [editError, setEditError] = useState("");

  const allPins = [...owners.map((o) => o.pin), ...investors.map((i) => i.pin), ...employees.map((e) => e.pin)];

  function regenPin() {
    setPin(genPin(allPins));
  }

  function addEmployee() {
    if (!name.trim() || !clubId) return;
    let finalPin = pin.trim();
    if (!finalPin) finalPin = genPin(allPins);
    if (allPins.includes(finalPin)) {
      alertPinTaken();
      return;
    }
    const emp = { id: uid(), name: name.trim(), clubId, pin: finalPin, payType, rate: parseFloat(rate) || 0 };
    updateEmployees((prev) => [...prev, emp]);
    setLastCreated(emp);
    logAction && logAction(`Добавлен сотрудник «${emp.name}»`);
    setName("");
    setPin("");
    setRate("");
  }
  const [pinTaken, setPinTaken] = useState(false);
  function alertPinTaken() {
    setPinTaken(true);
    setTimeout(() => setPinTaken(false), 2500);
  }

  function startEdit(e) {
    setEditingId(e.id);
    setEditName(e.name);
    setEditClubId(e.clubId);
    setEditPin(e.pin);
    setEditPayType(e.payType || "perShift");
    setEditRate(e.rate != null ? String(e.rate) : "");
    setEditError("");
  }
  function saveEdit() {
    if (!editName.trim() || !editClubId || editPin.length !== 4) { setEditError("Заполните все поля, PIN — 4 цифры."); return; }
    const otherPins = [...owners.map((o) => o.pin), ...investors.map((i) => i.pin), ...employees.filter((e) => e.id !== editingId).map((e) => e.pin)];
    if (otherPins.includes(editPin)) { setEditError("Этот PIN уже используется другим человеком."); return; }
    updateEmployees((prev) => prev.map((e) => (e.id === editingId ? { ...e, name: editName.trim(), clubId: editClubId, pin: editPin, payType: editPayType, rate: parseFloat(editRate) || 0 } : e)));
    logAction && logAction(`Изменены данные сотрудника «${editName.trim()}»`);
    setEditingId(null);
  }

  return (
    <div className="section-card">
      <div className="section-head"><h2>Сотрудники</h2><span className="count">{employees.length}</span></div>

      {lastCreated && (
        <div className="banner ok">Сотрудник «{lastCreated.name}» создан. PIN-код: <b>{lastCreated.pin}</b> — сообщите его сотруднику.</div>
      )}

      {employees.map((e) =>
        editingId === e.id ? (
          <div className="edit-block" key={e.id}>
            {editError && <div className="banner warn">{editError}</div>}
            <div className="form-grid">
              <Field label="Имя">
                <input value={editName} onChange={(ev) => setEditName(ev.target.value)} autoFocus />
              </Field>
              <Field label="Клуб">
                <select value={editClubId} onChange={(ev) => setEditClubId(ev.target.value)}>
                  {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="PIN-код (4 цифры)">
                <div className="pin-input-row">
                  <input value={editPin} maxLength={4} onChange={(ev) => setEditPin(ev.target.value.replace(/\D/g, ""))} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditPin(genPin([...owners.map((o) => o.pin), ...investors.map((i) => i.pin), ...employees.filter((x) => x.id !== editingId).map((x) => x.pin)]))}>Сгенерировать</button>
                </div>
              </Field>
              <Field label="Оплата">
                <select value={editPayType} onChange={(ev) => setEditPayType(ev.target.value)}>
                  <option value="perShift">За смену</option>
                  <option value="perHour">За час</option>
                </select>
              </Field>
              <Field label={editPayType === "perShift" ? "Ставка за смену, ₸" : "Ставка за час, ₸"}>
                <input type="number" inputMode="decimal" value={editRate} onChange={(ev) => setEditRate(ev.target.value)} placeholder="0" />
              </Field>
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => setEditingId(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={saveEdit}>Сохранить</button>
            </div>
          </div>
        ) : (
          <div className="list-row" key={e.id}>
            <div>
              <div className="lr-title">{e.name}</div>
              <div className="lr-meta">
                {(clubs.find((c) => c.id === e.clubId) || {}).name || "без клуба"} · PIN: {e.pin} · {e.rate ? fmtMoney(e.rate) + (e.payType === "perHour" ? "/час" : "/смена") : "ставка не задана"}
              </div>
            </div>
            <div className="row-align">
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(e)}>Изменить</button>
              <ConfirmButton small onConfirm={() => { updateEmployees((prev) => prev.filter((x) => x.id !== e.id)); logAction && logAction(`Удалён сотрудник «${e.name}»`); }} />
            </div>
          </div>
        )
      )}

      <div className="subhead">Новый сотрудник</div>
      {pinTaken && <div className="banner warn">Этот PIN уже используется, выберите другой.</div>}
      <div className="form-grid">
        <Field label="Имя">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Айжан С." />
        </Field>
        <Field label="Клуб">
          <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="PIN-код (4 цифры)">
          <div className="pin-input-row">
            <input value={pin} maxLength={4} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="напр. 2456" />
            <button className="btn btn-ghost btn-sm" onClick={regenPin}>Сгенерировать</button>
          </div>
        </Field>
        <Field label="Оплата">
          <select value={payType} onChange={(e) => setPayType(e.target.value)}>
            <option value="perShift">За смену</option>
            <option value="perHour">За час</option>
          </select>
        </Field>
        <Field label={payType === "perShift" ? "Ставка за смену, ₸" : "Ставка за час, ₸"}>
          <input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <button className="btn btn-primary btn-block" onClick={addEmployee}>Создать сотрудника</button>
    </div>
  );
}

/* ================= INVESTORS (owner side) ================= */
function InvestorsTab({ clubs, investors, updateInvestors, owners, employees, logAction }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [clubIds, setClubIds] = useState([]);
  const [lastCreated, setLastCreated] = useState(null);
  const [pinError, setPinError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editClubIds, setEditClubIds] = useState([]);
  const [editError, setEditError] = useState("");

  const allPins = [...owners.map((o) => o.pin), ...employees.map((e) => e.pin), ...investors.map((i) => i.pin)];

  function toggleClub(id, list, setList) {
    setList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addInvestor() {
    if (!name.trim() || clubIds.length === 0) return;
    let finalPin = pin.trim();
    if (!finalPin) finalPin = genPin(allPins);
    if (allPins.includes(finalPin)) { setPinError("Этот PIN уже используется, выберите другой."); setTimeout(() => setPinError(""), 2500); return; }
    const inv = { id: uid(), name: name.trim(), pin: finalPin, clubIds: [...clubIds] };
    updateInvestors((prev) => [...prev, inv]);
    logAction && logAction(`Добавлен инвестор «${inv.name}»`);
    setLastCreated(inv);
    setName(""); setPin(""); setClubIds([]);
  }

  function startEdit(i) {
    setEditingId(i.id);
    setEditName(i.name);
    setEditPin(i.pin);
    setEditClubIds([...i.clubIds]);
    setEditError("");
  }
  function saveEdit() {
    if (!editName.trim() || editClubIds.length === 0 || editPin.length !== 4) { setEditError("Заполните имя, выберите хотя бы один клуб, PIN — 4 цифры."); return; }
    const otherPins = [...owners.map((o) => o.pin), ...employees.map((e) => e.pin), ...investors.filter((i) => i.id !== editingId).map((i) => i.pin)];
    if (otherPins.includes(editPin)) { setEditError("Этот PIN уже используется другим человеком."); return; }
    updateInvestors((prev) => prev.map((i) => (i.id === editingId ? { ...i, name: editName.trim(), pin: editPin, clubIds: [...editClubIds] } : i)));
    logAction && logAction(`Изменены данные инвестора «${editName.trim()}»`);
    setEditingId(null);
  }

  return (
    <div className="section-card">
      <div className="section-head"><h2>Инвесторы</h2><span className="count">{investors.length}</span></div>
      <p className="muted">Инвестор заходит по своему PIN и видит только экономику клубов, к которым у него есть доступ — без права что-либо менять.</p>

      {lastCreated && (
        <div className="banner ok">Инвестор «{lastCreated.name}» создан. PIN-код: <b>{lastCreated.pin}</b> — сообщите его инвестору.</div>
      )}

      {investors.map((i) =>
        editingId === i.id ? (
          <div className="edit-block" key={i.id}>
            {editError && <div className="banner warn">{editError}</div>}
            <Field label="Имя">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
            </Field>
            <Field label="Доступные клубы">
              <div className="checkbox-list">
                {clubs.map((c) => (
                  <label className="checkbox-item" key={c.id}>
                    <input type="checkbox" checked={editClubIds.includes(c.id)} onChange={() => toggleClub(c.id, editClubIds, setEditClubIds)} />
                    {c.name}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="PIN-код (4 цифры)">
              <div className="pin-input-row">
                <input value={editPin} maxLength={4} onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))} />
                <button className="btn btn-ghost btn-sm" onClick={() => setEditPin(genPin([...owners.map((o) => o.pin), ...employees.map((e) => e.pin), ...investors.filter((x) => x.id !== editingId).map((x) => x.pin)]))}>Сгенерировать</button>
              </div>
            </Field>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => setEditingId(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={saveEdit}>Сохранить</button>
            </div>
          </div>
        ) : (
          <div className="list-row" key={i.id}>
            <div>
              <div className="lr-title">{i.name}</div>
              <div className="lr-meta">
                {i.clubIds.map((cid) => (clubs.find((c) => c.id === cid) || {}).name).filter(Boolean).join(", ") || "нет доступа к клубам"} · PIN: {i.pin}
              </div>
            </div>
            <div className="row-align">
              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(i)}>Изменить</button>
              <ConfirmButton small onConfirm={() => { updateInvestors((prev) => prev.filter((x) => x.id !== i.id)); logAction && logAction(`Удалён инвестор «${i.name}»`); }} />
            </div>
          </div>
        )
      )}

      <div className="subhead">Новый инвестор</div>
      {pinError && <div className="banner warn">{pinError}</div>}
      <Field label="Имя">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Алихан К." />
      </Field>
      <Field label="Доступные клубы">
        <div className="checkbox-list">
          {clubs.map((c) => (
            <label className="checkbox-item" key={c.id}>
              <input type="checkbox" checked={clubIds.includes(c.id)} onChange={() => toggleClub(c.id, clubIds, setClubIds)} />
              {c.name}
            </label>
          ))}
        </div>
      </Field>
      <Field label="PIN-код (4 цифры)">
        <div className="pin-input-row">
          <input value={pin} maxLength={4} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="напр. 7391" />
          <button className="btn btn-ghost btn-sm" onClick={() => setPin(genPin(allPins))}>Сгенерировать</button>
        </div>
      </Field>
      <button className="btn btn-primary btn-block" onClick={addInvestor}>Создать инвестора</button>
    </div>
  );
}

function shiftHours(s) {
  if (!s.openedAt || !s.closedAt) return 0;
  return Math.max(0, (new Date(s.closedAt) - new Date(s.openedAt)) / 3600000);
}

/* ================= PAYROLL ================= */
function PayrollTab({ clubs, employees, shifts }) {
  const [period, setPeriod] = useState("month");
  const [clubFilter, setClubFilter] = useState("all");

  const now = new Date();
  const cutoff = period === "day" ? startOfDay(now) : period === "week" ? startOfWeek(now) : period === "month" ? startOfMonth(now) : null;
  function inPeriod(iso) { return !cutoff ? true : new Date(iso) >= cutoff; }

  const filteredEmployees = employees.filter((e) => clubFilter === "all" || e.clubId === clubFilter);

  const rows = filteredEmployees.map((e) => {
    const empShifts = shifts.filter((s) => s.employeeId === e.id && s.status === "closed" && inPeriod(s.closedAt));
    const shiftsCount = empShifts.length;
    const hours = empShifts.reduce((a, s) => a + shiftHours(s), 0);
    const earned = e.payType === "perHour" ? hours * (e.rate || 0) : shiftsCount * (e.rate || 0);
    const taken = empShifts.reduce((a, s) => a + (s.salaryTaken || 0), 0);
    return { employee: e, club: clubs.find((c) => c.id === e.clubId), shiftsCount, hours, earned, taken, remaining: earned - taken };
  });

  const totals = rows.reduce((a, r) => ({ earned: a.earned + r.earned, taken: a.taken + r.taken, remaining: a.remaining + r.remaining }), { earned: 0, taken: 0, remaining: 0 });

  return (
    <div>
      <div className="row-between">
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}>
          <option value="all">Все клубы</option>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#FB923C22", color: "#FB923C" }}>₸</span>Начислено всего</div>
          <div className="stat-value num">{fmtMoney(totals.earned)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#B98CFF22", color: "#B98CFF" }}>↓</span>Уже забрано</div>
          <div className="stat-value num">{fmtMoney(totals.taken)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-head"><span className="ic" style={{ background: "#4DE0C422", color: "#4DE0C4" }}>◐</span>Осталось выплатить</div>
          <div className="stat-value num">{fmtMoney(totals.remaining)}</div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-head"><h2>По сотрудникам</h2></div>
        {rows.length === 0 && <p className="muted center pad">Нет сотрудников для отображения.</p>}
        {rows.length > 0 && (
          <table>
            <thead><tr><th>Сотрудник</th><th>Клуб</th><th>Смен</th><th>Часов</th><th>Начислено</th><th>Забрано</th><th>К выплате</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee.id}>
                  <td className="club-name">{r.employee.name}</td>
                  <td>{r.club ? r.club.name : "\u2014"}</td>
                  <td className="num">{r.shiftsCount}</td>
                  <td className="num">{r.hours.toFixed(1)}</td>
                  <td className="num">{fmtMoney(r.earned)}</td>
                  <td className="num">{fmtMoney(r.taken)}</td>
                  <td className={"num " + (r.remaining < 0 ? "warn" : r.remaining === 0 ? "" : "ok")}>{fmtMoney(r.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>«Забрано» — суммы, которые сотрудники сами указали при закрытии смены как забранную зарплату. Если ставка не задана в карточке сотрудника, начисление будет 0 — задайте её во вкладке «Сотрудники».</p>
      </div>
    </div>
  );
}

/* ================= EQUIPMENT ================= */
function EquipmentTab({ clubs, equipment, updateEquipment, issues, logAction }) {
  const [clubId, setClubId] = useState(clubs[0]?.id || "");
  const [label, setLabel] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  function addEquipment() {
    if (!label.trim() || !clubId) return;
    const eq = { id: uid(), clubId, label: label.trim() };
    updateEquipment((prev) => [...prev, eq]);
    logAction && logAction(`Добавлен ПК «${eq.label}»`);
    setLabel("");
  }

  return (
    <div className="section-card">
      <div className="section-head"><h2>Компьютеры</h2><span className="count">{equipment.length}</span></div>
      {clubs.map((c) => {
        const clubEquipment = equipment.filter((e) => e.clubId === c.id);
        return (
          <div key={c.id} style={{ marginBottom: 8 }}>
            <div className="subhead">{c.name}</div>
            {clubEquipment.length === 0 && <p className="muted" style={{ marginBottom: 10 }}>Нет добавленных ПК.</p>}
            {clubEquipment.map((pc) => {
              const pcIssues = [...issues].filter((i) => i.equipmentId === pc.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
              const broken = pcIssues.some((i) => i.status === "open");
              const expanded = expandedId === pc.id;
              return (
                <div key={pc.id}>
                  <div className="list-row">
                    <button className="lr-clickable" onClick={() => setExpandedId(expanded ? null : pc.id)}>
                      <div className="lr-title">{pc.label}</div>
                      <div className="lr-meta">{pcIssues.length} инцидент(ов) {expanded ? "▲" : "▼"}</div>
                    </button>
                    <div className="row-align">
                      <span className={"pill " + (broken ? "warn" : "ok")}>{broken ? "Сломан" : "Исправен"}</span>
                      <ConfirmButton small onConfirm={() => { updateEquipment((prev) => prev.filter((x) => x.id !== pc.id)); logAction && logAction(`Удалён ПК «${pc.label}»`); }} />
                    </div>
                  </div>
                  {expanded && (
                    <div className="equipment-history">
                      {pcIssues.length === 0 && <p className="muted" style={{ marginBottom: 0 }}>Поломок не зафиксировано.</p>}
                      {pcIssues.map((i) => (
                        <div className="feed-row" key={i.id}>
                          <span className="feed-dot" style={{ background: i.status === "open" ? "#FF6B6B" : "#4DE0C4" }} />
                          <div className="feed-body">
                            <div className="feed-title">{i.title}</div>
                            <div className="feed-meta">{i.employeeName} · {fmtDateTime(i.createdAt)} · {i.status === "open" ? "не устранено" : "исправлено"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="subhead">Добавить ПК</div>
      <div className="form-grid">
        <Field label="Клуб">
          <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Название / номер">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="напр. ПК 18" />
        </Field>
      </div>
      <button className="btn btn-primary btn-block" onClick={addEquipment}>Добавить</button>
    </div>
  );
}

function ShiftsTab({ clubs, shifts }) {
  const [clubFilter, setClubFilter] = useState("all");
  const sorted = [...shifts].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  const filtered = sorted.filter((s) => clubFilter === "all" || s.clubId === clubFilter);

  return (
    <div className="section-card">
      <div className="section-head">
        <h2>Смены</h2>
        <select value={clubFilter} onChange={(e) => setClubFilter(e.target.value)}>
          <option value="all">Все клубы</option>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {filtered.length === 0 && <p className="muted center pad">Смен пока нет.</p>}
      {filtered.map((s) => {
        const club = clubs.find((c) => c.id === s.clubId);
        const revenue = (s.senetRevenue || 0) + (s.kaspiRevenue || 0) + (s.cashRevenue || 0);
        return (
          <div className="list-row col" key={s.id}>
            <div className="row-between full">
              <div>
                <div className="lr-title">{s.employeeName} · {club ? club.name : "\u2014"}</div>
                <div className="lr-meta">
                  {fmtDateTime(s.openedAt)} {s.closedAt ? "→ " + fmtDateTime(s.closedAt) : ""}
                </div>
              </div>
              <span className={"pill " + (s.status === "open" ? "warn" : "ok")}>{s.status === "open" ? "Открыта" : "Закрыта"}</span>
            </div>
            {s.status === "closed" && (
              <div className="shift-detail">
                <span>Выручка: <b className="num">{fmtMoney(revenue)}</b></span>
                <span>Расходы: <b className="num">{fmtMoney((s.shiftExpenses || []).reduce((a, e) => a + e.amount, 0))}</b></span>
                {s.salaryTaken > 0 && <span>Зарплата забрана: <b className="num">{fmtMoney(s.salaryTaken)}</b></span>}
                <span>Расхождение: <b className={"num " + (s.discrepancy === 0 ? "ok" : "warn")}>{fmtMoney(s.discrepancy)}</b></span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const EXPENSE_CATEGORIES = ["Аренда", "Электричество", "Налоги", "Зарплата", "Прочее"];

function ExpensesTab({ clubs, expenses, updateExpenses, logAction }) {
  const [clubId, setClubId] = useState(clubs[0]?.id || "");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function addExpense() {
    const amt = parseFloat(amount) || 0;
    if (!amt || !clubId) return;
    updateExpenses((prev) => [
      ...prev,
      { id: uid(), clubId, category, amount: amt, note: note.trim(), addedAt: new Date().toISOString() },
    ]);
    const club = clubs.find((c) => c.id === clubId);
    logAction && logAction(`Добавлен расход «${category}» ${fmtMoney(amt)} — ${club ? club.name : ""}`);
    setAmount("");
    setNote("");
  }

  const sorted = [...expenses].sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

  return (
    <div className="section-card">
      <div className="section-head"><h2>Расходы</h2><span className="count">{expenses.length}</span></div>

      <div className="form-grid">
        <Field label="Клуб">
          <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Категория">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Сумма, ₸">
          <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Комментарий">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="напр. аренда за сентябрь" />
        </Field>
      </div>
      <button className="btn btn-primary btn-block" onClick={addExpense}>Добавить расход</button>

      <div className="subhead">История</div>
      {sorted.length === 0 && <p className="muted center pad">Расходов пока нет.</p>}
      {sorted.map((e) => {
        const club = clubs.find((c) => c.id === e.clubId);
        return (
          <div className="list-row" key={e.id}>
            <div>
              <div className="lr-title">
                <span className="cat-dot" style={{ background: CATEGORY_COLORS[e.category] || "#93A18C" }} />
                {e.category} — {club ? club.name : "\u2014"}
              </div>
              <div className="lr-meta">{e.note || "без комментария"} · {fmtDate(e.addedAt)}</div>
            </div>
            <div className="row-align">
              <b className="num">{fmtMoney(e.amount)}</b>
              <ConfirmButton small onConfirm={() => { updateExpenses((prev) => prev.filter((x) => x.id !== e.id)); logAction && logAction(`Удалён расход «${e.category}» ${fmtMoney(e.amount)}`); }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IssuesTab({ clubs, issues, updateIssues, logAction }) {
  const sorted = [...issues].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  function toggle(id) {
    const issue = issues.find((i) => i.id === id);
    updateIssues((prev) => prev.map((i) => (i.id === id ? { ...i, status: i.status === "open" ? "fixed" : "open" } : i)));
    if (issue) logAction && logAction(`Неисправность «${issue.title}» отмечена как ${issue.status === "open" ? "исправлена" : "открыта снова"}`);
  }
  return (
    <div className="section-card">
      <div className="section-head"><h2>Неисправности</h2><span className="count">{issues.filter((i) => i.status === "open").length}</span></div>
      {sorted.length === 0 && <p className="muted center pad">Заявок нет.</p>}
      {sorted.map((i) => {
        const club = clubs.find((c) => c.id === i.clubId);
        return (
          <div className="list-row" key={i.id}>
            <div>
              <div className="lr-title">{i.equipmentLabel ? i.equipmentLabel + " — " : ""}{i.title}</div>
              <div className="lr-meta">{club ? club.name : "\u2014"} · {i.employeeName} · {fmtDateTime(i.createdAt)}</div>
              {i.description && <div className="lr-desc">{i.description}</div>}
            </div>
            <button className={"pill clickable " + (i.status === "open" ? "warn" : "ok")} onClick={() => toggle(i.id)}>
              {i.status === "open" ? "Открыта" : "Исправлено"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PurchasesTab({ clubs, purchases, updatePurchases, logAction }) {
  const sorted = [...purchases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  function toggle(id) {
    const purchase = purchases.find((p) => p.id === id);
    updatePurchases((prev) => prev.map((p) => (p.id === id ? { ...p, status: p.status === "pending" ? "delivered" : "pending" } : p)));
    if (purchase) logAction && logAction(`Заявка «${purchase.item}» отмечена как ${purchase.status === "pending" ? "доставлена" : "ожидает"}`);
  }
  return (
    <div className="section-card">
      <div className="section-head"><h2>Заявки на закупку</h2><span className="count">{purchases.filter((p) => p.status === "pending").length}</span></div>
      {sorted.length === 0 && <p className="muted center pad">Заявок нет.</p>}
      {sorted.map((p) => {
        const club = clubs.find((c) => c.id === p.clubId);
        return (
          <div className="list-row" key={p.id}>
            <div>
              <div className="lr-title">{p.item} — {p.qty}</div>
              <div className="lr-meta">{club ? club.name : "\u2014"} · {p.employeeName} · {fmtDateTime(p.createdAt)}</div>
            </div>
            <button className={"pill clickable " + (p.status === "pending" ? "warn" : "ok")} onClick={() => toggle(p.id)}>
              {p.status === "pending" ? "Ожидает" : "Доставлено"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ================= SETTINGS ================= */
/* ================= ACTIVITY LOG ================= */
function ActivityLogTab({ activityLog }) {
  const sorted = [...activityLog].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  return (
    <div className="section-card">
      <div className="section-head"><h2>Журнал действий</h2><span className="count">{activityLog.length}</span></div>
      <p className="muted">Здесь фиксируются изменения, сделанные в панели управления — полезно, если доступ есть у нескольких людей.</p>
      {sorted.length === 0 && <p className="muted center pad">Пока никаких действий не записано.</p>}
      {sorted.map((entry) => (
        <div className="feed-row" key={entry.id}>
          <span className="feed-dot" style={{ background: "#64748B" }} />
          <div className="feed-body">
            <div className="feed-title">{entry.text}</div>
            <div className="feed-meta">{entry.actor} · {fmtDateTime(entry.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsTab({ owners, updateOwners, employees, investors, logAction }) {
  const owner = owners[0] || null;
  const [name, setName] = useState(owner ? owner.name : "");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [msg, setMsg] = useState(null); // {type:'ok'|'warn', text}

  function saveName() {
    if (!name.trim() || !owner) return;
    updateOwners((prev) => prev.map((o) => (o.id === owner.id ? { ...o, name: name.trim() } : o)));
    logAction && logAction(`Изменено имя владельца на «${name.trim()}»`);
    setMsg({ type: "ok", text: "Имя обновлено." });
    setTimeout(() => setMsg(null), 2500);
  }

  function changePin() {
    if (!owner) return;
    if (currentPin !== owner.pin) { setMsg({ type: "warn", text: "Текущий PIN указан неверно." }); return; }
    if (newPin.length !== 4) { setMsg({ type: "warn", text: "Новый PIN должен состоять из 4 цифр." }); return; }
    if (newPin !== confirmPin) { setMsg({ type: "warn", text: "Новый PIN и подтверждение не совпадают." }); return; }
    if (employees.some((e) => e.pin === newPin) || investors.some((i) => i.pin === newPin)) { setMsg({ type: "warn", text: "Этот PIN уже занят другим пользователем." }); return; }
    updateOwners((prev) => prev.map((o) => (o.id === owner.id ? { ...o, pin: newPin } : o)));
    logAction && logAction("PIN-код владельца был изменён");
    setCurrentPin(""); setNewPin(""); setConfirmPin("");
    setMsg({ type: "ok", text: "PIN-код владельца обновлён." });
    setTimeout(() => setMsg(null), 3000);
  }

  if (!owner) return <div className="section-card"><p className="muted">Владелец не найден.</p></div>;

  return (
    <div>
      {msg && <div className={"banner " + (msg.type === "warn" ? "warn" : "ok")}>{msg.text}</div>}

      <div className="section-card">
        <div className="section-head"><h2>Профиль владельца</h2></div>
        <Field label="Имя">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button className="btn btn-primary" onClick={saveName}>Сохранить имя</button>
      </div>

      <div className="section-card">
        <div className="section-head"><h2>Сменить PIN-код</h2></div>
        <p className="muted">Этим PIN вы входите в панель владельца. Никому не сообщайте его, кроме доверенных лиц.</p>
        <Field label="Текущий PIN">
          <input value={currentPin} maxLength={4} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
        </Field>
        <Field label="Новый PIN (4 цифры)">
          <input value={newPin} maxLength={4} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
        </Field>
        <Field label="Повторите новый PIN">
          <input value={confirmPin} maxLength={4} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
        </Field>
        <button className="btn btn-primary" onClick={changePin}>Обновить PIN</button>
      </div>
    </div>
  );
}

/* ================= ROOT APP ================= */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [clubs, setClubs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [owners, setOwners] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [issues, setIssues] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const [screen, setScreen] = useState("pin");
  const [currentUser, setCurrentUser] = useState(null);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    (async () => {
      const seeded = await tryGet("pc:seeded");
      if (!seeded) {
        await saveKey("pc:clubs", [{ id: "c1", name: "Туркестан" }, { id: "c2", name: "Кентау" }]);
        await saveKey("pc:owners", [{ id: "o1", name: "Владелец", pin: "1111" }]);
        await saveKey("pc:employees", []);
        await saveKey("pc:investors", []);
        await saveKey("pc:equipment", []);
        await saveKey("pc:activityLog", []);
        await saveKey("pc:shifts", []);
        await saveKey("pc:expenses", []);
        await saveKey("pc:issues", []);
        await saveKey("pc:purchases", []);
        await saveKey("pc:seeded", true);
      }

      let loadedClubs = await loadKey("pc:clubs", []);
      let loadedOwners = await loadKey("pc:owners", []);

      // safety net: if a previous save silently failed and left owners/clubs empty
      // (so login would be permanently impossible), repair it here.
      if (!loadedOwners || loadedOwners.length === 0) {
        loadedOwners = [{ id: "o1", name: "Владелец", pin: "1111" }];
        await saveKey("pc:owners", loadedOwners);
      }
      if (!loadedClubs || loadedClubs.length === 0) {
        loadedClubs = [{ id: "c1", name: "Туркестан" }, { id: "c2", name: "Кентау" }];
        await saveKey("pc:clubs", loadedClubs);
      }

      setClubs(loadedClubs);
      setOwners(loadedOwners);
      setEmployees(await loadKey("pc:employees", []));
      setInvestors(await loadKey("pc:investors", []));
      setEquipment(await loadKey("pc:equipment", []));
      setActivityLog(await loadKey("pc:activityLog", []));
      setShifts(await loadKey("pc:shifts", []));
      setExpenses(await loadKey("pc:expenses", []));
      setIssues(await loadKey("pc:issues", []));
      setPurchases(await loadKey("pc:purchases", []));
      setLoading(false);
    })();
  }, []);

  function makeUpdater(key, setState) {
    return (updater) => {
      setState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        saveKey(key, next);
        return next;
      });
    };
  }
  const updateClubs = makeUpdater("pc:clubs", setClubs);
  const updateEmployees = makeUpdater("pc:employees", setEmployees);
  const updateShifts = makeUpdater("pc:shifts", setShifts);
  const updateExpenses = makeUpdater("pc:expenses", setExpenses);
  const updateIssues = makeUpdater("pc:issues", setIssues);
  const updatePurchases = makeUpdater("pc:purchases", setPurchases);
  const updateOwners = makeUpdater("pc:owners", setOwners);
  const updateInvestors = makeUpdater("pc:investors", setInvestors);
  const updateEquipment = makeUpdater("pc:equipment", setEquipment);
  const updateActivityLog = makeUpdater("pc:activityLog", setActivityLog);

  function handlePinSubmit(pin) {
    const owner = owners.find((o) => o.pin === pin);
    if (owner) {
      setCurrentUser(owner);
      setScreen("owner");
      setPinError("");
      return;
    }
    const emp = employees.find((e) => e.pin === pin);
    if (emp) {
      setCurrentUser(emp);
      setScreen("employee");
      setPinError("");
      return;
    }
    const inv = investors.find((i) => i.pin === pin);
    if (inv) {
      setCurrentUser(inv);
      setScreen("investor");
      setPinError("");
      return;
    }
    setPinError("Неверный PIN-код");
    setTimeout(() => setPinError(""), 1500);
  }

  function logout() {
    setCurrentUser(null);
    setScreen("pin");
  }

  return (
    <div className="pc-root">
      <style>{CSS}</style>
      {loading ? (
        <div className="loading">Загрузка…</div>
      ) : screen === "pin" ? (
        <PinScreen onSubmit={handlePinSubmit} error={pinError} />
      ) : screen === "owner" ? (
        <OwnerDashboard
          onLogout={logout}
          data={{
            clubs, updateClubs,
            employees, updateEmployees,
            owners, updateOwners,
            investors, updateInvestors,
            equipment, updateEquipment,
            activityLog, updateActivityLog,
            shifts, updateShifts,
            expenses, updateExpenses,
            issues, updateIssues,
            purchases, updatePurchases,
          }}
        />
      ) : screen === "investor" ? (
        <InvestorPanel
          investor={currentUser}
          clubs={clubs}
          shifts={shifts}
          expenses={expenses}
          onLogout={logout}
        />
      ) : (
        <EmployeePanel
          employee={currentUser}
          club={clubs.find((c) => c.id === currentUser.clubId)}
          equipment={equipment}
          shifts={shifts}
          updateShifts={updateShifts}
          issues={issues}
          updateIssues={updateIssues}
          purchases={purchases}
          updatePurchases={updatePurchases}
          updateExpenses={updateExpenses}
          onLogout={logout}
        />
      )}
    </div>
  );
}

/* ================= CSS ================= */
const CSS = `
.pc-root{
  --bg:#0A0E1A; --surface:#121A2C; --surface-2:#1A2438; --border:#2A3652; --border-soft:#1D2740;
  --text:#F1F5F9; --text-dim:#93A0BD; --text-faint:#5C6785;
  --accent:#4F8EF7; --accent-2:#22D3EE; --accent-wash:rgba(79,142,247,0.14);
  --blue:#4F8EF7; --blue-wash:rgba(79,142,247,0.14);
  --purple:#B98CFF; --purple-wash:rgba(185,140,255,0.12);
  --teal:#4DE0C4; --teal-wash:rgba(77,224,196,0.12);
  --yellow:#FFD24C; --yellow-wash:rgba(255,210,76,0.12);
  --warn:#FF8A4C; --warn-wash:rgba(255,138,76,0.14);
  --danger:#FF6B6B; --danger-wash:rgba(255,107,107,0.13);
  --green:#34D399; --green-wash:rgba(52,211,153,0.14);
  font-family:'Manrope',sans-serif; color:var(--text); background:var(--bg);
  min-height:100vh; width:100%; position:relative; isolation:isolate;
}
.pc-root::before{
  content:''; position:fixed; inset:0; z-index:-1; pointer-events:none;
  background:
    radial-gradient(650px 420px at 8% -8%, rgba(79,142,247,0.12), transparent 60%),
    radial-gradient(600px 460px at 105% 15%, rgba(185,140,255,0.09), transparent 60%),
    radial-gradient(700px 500px at 50% 115%, rgba(34,211,238,0.07), transparent 60%);
}
.pc-root *{box-sizing:border-box;}
.pc-root .num{font-family:'Space Grotesk',sans-serif; font-feature-settings:"tnum" 1;}
.pc-root button{font-family:inherit; cursor:pointer; -webkit-appearance:none; appearance:none;}
.pc-root input, .pc-root select, .pc-root textarea{
  width:100%; background:var(--surface-2); border:1px solid var(--border-soft); color:var(--text);
  border-radius:9px; padding:10px 12px; font-size:15.5px; font-family:inherit; transition:border-color .15s;
}
.pc-root input:focus, .pc-root select:focus, .pc-root textarea:focus{ outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-wash); }
.loading{ display:flex; align-items:center; justify-content:center; height:100vh; color:var(--text-dim); }

.logo{display:flex; align-items:center; gap:10px;}
.logo-mark{width:34px; height:34px; border-radius:10px; background:linear-gradient(155deg,var(--accent),var(--accent-2)); display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 4px 18px -4px rgba(79,142,247,0.55);}
.logo-mark.sm{width:30px;height:30px;}
.logo-mark svg{width:18px;height:18px;}
.logo-text{line-height:1.15;}
.logo-text .l1{font-weight:800; font-size:15.5px;}
.logo-text .l2{font-weight:700; font-size:11px; background:linear-gradient(90deg,var(--accent),var(--accent-2)); -webkit-background-clip:text; background-clip:text; color:transparent; letter-spacing:1.5px;}

/* avatars */
.who{ display:flex; align-items:center; gap:11px; }
.avatar{ width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:15px; color:#0A0F0C; flex-shrink:0; }
.owner-name{ font-size:14.5px; color:var(--text-dim); font-weight:600; }

/* pin screen */
.pin-screen{ max-width:340px; margin:0 auto; padding:56px 20px 40px; display:flex; flex-direction:column; align-items:center; gap:6px; }
.pin-logo{ margin-bottom:22px; }
.pin-logo .logo-mark{ width:52px; height:52px; border-radius:15px; }
.pin-logo .logo-mark svg{ width:26px; height:26px; }
.pin-logo .logo-text .l1{ font-size:20px; }
.pin-logo .logo-text .l2{ font-size:13.5px; }
.pin-title{ font-size:17px; color:var(--text-dim); margin-bottom:20px; }
.pin-dots{ display:flex; gap:16px; margin-bottom:6px; }
.pin-dot{ width:15px; height:15px; border-radius:50%; border:2px solid var(--border); transition:all .15s; }
.pin-dot.filled{ background:linear-gradient(135deg,var(--accent),var(--accent-2)); border-color:transparent; box-shadow:0 0 10px rgba(79,142,247,0.6); }
.pin-dots.shake{ animation:shake .4s; }
@keyframes shake{ 10%,90%{transform:translateX(-2px)} 20%,80%{transform:translateX(4px)} 30%,50%,70%{transform:translateX(-8px)} 40%,60%{transform:translateX(8px)} }
.pin-error{ color:var(--danger); font-size:14.5px; height:18px; font-weight:600; }
.pin-error.placeholder{ visibility:hidden; }
.pin-pad{ display:grid; grid-template-columns:repeat(3,66px); gap:16px; margin-top:20px; }
.pin-key{ width:66px; height:66px; border-radius:50%; background:var(--surface); border:1px solid var(--border-soft); color:var(--text); font-size:23.5px; font-weight:700; transition:all .12s; }
.pin-key:active{ background:var(--accent-wash); border-color:var(--accent); transform:scale(0.95); }
.pin-key-fn{ font-size:20px; color:var(--text-dim); }
.pin-hint{ margin-top:28px; font-size:13.5px; color:var(--text-faint); }
.pin-hint b{ color:var(--accent); }

/* shells */
.app-shell{ max-width:720px; margin:0 auto; padding:0 16px 40px; min-height:100vh; }
.emp-header, .owner-header{ display:flex; align-items:center; justify-content:space-between; padding:22px 0 16px; }
.emp-name{ font-weight:800; font-size:18px; }
.emp-club{ font-size:14px; color:var(--text-dim); }

.tabbar{ display:flex; gap:7px; margin-bottom:18px; flex-wrap:wrap; }
.tabbar.scroll{ flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:2px; }
.tabbar.scroll::-webkit-scrollbar{ display:none; }
.tabbar-wrap{ position:relative; }
.tabbar-fade{ position:absolute; top:0; right:0; bottom:2px; width:34px; pointer-events:none; background:linear-gradient(90deg, transparent, var(--bg) 85%); }

/* owner shell: sidebar layout */
.owner-shell{ display:grid; grid-template-columns:250px 1fr; min-height:100vh; }
.owner-sidebar{ background:var(--surface); border-right:1px solid var(--border-soft); padding:26px 18px; display:flex; flex-direction:column; gap:28px; position:sticky; top:0; align-self:start; height:100vh; overflow-y:auto; }
.side-nav{ display:flex; flex-direction:column; gap:3px; }
.side-nav-item{ display:flex; align-items:center; gap:12px; padding:11px 13px; border-radius:11px; background:none; border:none; color:var(--text-dim); font-size:14.5px; font-weight:700; text-align:left; transition:background .15s,color .15s; }
.side-nav-item:hover{ background:var(--surface-2); color:var(--text); }
.side-nav-ic{ width:20px; height:20px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.side-nav-ic svg{ width:19px; height:19px; }

.sidebar-foot{ margin-top:auto; padding:14px 13px; border-radius:12px; background:var(--surface-2); border:1px solid var(--border-soft); display:flex; gap:10px; align-items:flex-start; }
.foot-dot{ width:8px; height:8px; border-radius:50%; background:var(--accent); margin-top:5px; flex-shrink:0; box-shadow:0 0 0 3px var(--accent-wash); }
.foot-t1{ font-size:13.5px; font-weight:700; }
.foot-t2{ font-size:12px; color:var(--text-faint); margin-top:2px; }

.owner-main{ padding:26px 34px 48px; max-width:1180px; }
.owner-topbar{ display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:14px; }
.page-title{ font-size:27px; font-weight:800; letter-spacing:-0.3px; }
.page-sub{ font-size:14px; color:var(--text-dim); margin-top:5px; text-transform:capitalize; }
.topbar-right{ display:flex; align-items:center; gap:12px; position:relative; }
.bell-btn{ width:38px; height:38px; border-radius:50%; background:var(--surface); border:1px solid var(--border-soft); display:flex; align-items:center; justify-content:center; position:relative; color:var(--text-dim); }
.bell-dot{ position:absolute; top:8px; right:9px; width:7px; height:7px; border-radius:50%; background:var(--danger); border:2px solid var(--surface); }
.who-btn{ display:flex; align-items:center; gap:9px; background:var(--surface); border:1px solid var(--border-soft); border-radius:24px; padding:6px 14px 6px 6px; color:var(--text); }
.who-text{ display:flex; flex-direction:column; align-items:flex-start; line-height:1.2; }
.who-menu{ position:absolute; top:48px; right:0; background:var(--surface); border:1px solid var(--border-soft); border-radius:12px; padding:8px; width:140px; box-shadow:0 12px 30px -8px rgba(0,0,0,0.5); z-index:5; }

@media (max-width:900px){
  .owner-shell{ grid-template-columns:1fr; }
  .owner-sidebar{ position:relative; height:auto; flex-direction:row; align-items:center; padding:14px 16px; overflow-x:auto; gap:16px; top:auto; }
  .owner-sidebar .logo{ flex-shrink:0; }
  .side-nav{ flex-direction:row; gap:6px; }
  .side-nav-item{ white-space:nowrap; padding:8px 12px; }
  .sidebar-foot{ display:none; }
  .owner-main{ padding:18px; }
}

/* charts */
.linechart-wrap{ width:100%; }
.linechart-svg{ width:100%; height:220px; display:block; }
.linechart-legend{ display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px; }
.legend-item{ display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:var(--text-dim); }
.legend-dot{ width:8px; height:8px; border-radius:50%; }
.linechart-axis{ display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-faint); margin-top:6px; }

.bar-chart{ display:flex; align-items:flex-end; gap:10px; height:200px; padding-top:20px; }
.bar-col{ flex:1; display:flex; flex-direction:column; align-items:center; height:100%; }
.bar-value{ font-size:11.5px; color:var(--text-dim); margin-bottom:6px; font-weight:700; }
.bar-track{ flex:1; width:100%; display:flex; align-items:flex-end; background:var(--surface-2); border-radius:6px; overflow:hidden; }
.bar-fill{ width:100%; border-radius:6px 6px 0 0; transition:height .3s ease; }
.bar-label{ font-size:11.5px; color:var(--text-faint); margin-top:8px; text-transform:capitalize; }

.donut-row{ display:flex; align-items:center; gap:28px; flex-wrap:wrap; }
.donut-wrap{ position:relative; width:150px; height:150px; flex-shrink:0; }
.donut-svg{ width:100%; height:100%; }
.donut-center{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
.donut-total{ font-size:16px; font-weight:800; }
.donut-label{ font-size:11px; color:var(--text-faint); margin-top:2px; }
.donut-legend{ flex:1; min-width:180px; display:flex; flex-direction:column; gap:10px; }
.donut-legend-row{ display:flex; align-items:center; justify-content:space-between; font-size:14px; }
.donut-legend-label{ display:flex; align-items:center; gap:9px; color:var(--text-dim); font-weight:600; }

.club-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; }
.club-card{ border-radius:18px; border:1px solid; padding:20px; position:relative; overflow:hidden; }
.club-card-badge{ width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; color:#0A0E1A; margin-bottom:14px; }
.club-card-name{ font-weight:800; font-size:16px; margin-bottom:6px; }
.club-card-revenue{ font-size:24px; font-weight:800; margin-bottom:6px; }
.club-card-today{ font-size:13px; color:var(--text-dim); }
.club-card-today b{ color:var(--text); }
.club-card-growth{ font-size:12.5px; font-weight:700; margin-top:10px; }
.club-card-growth.pos{ color:var(--green); }
.club-card-growth.neg{ color:var(--danger); }
.club-card-clickable{ cursor:pointer; text-align:left; width:100%; font-family:inherit; transition:transform .15s, border-color .15s; display:block; }
.club-card-clickable:hover{ transform:translateY(-2px); }
.club-card-arrow{ display:block; margin-top:12px; font-size:12.5px; font-weight:700; color:var(--text-dim); }
.club-card-badge.lg{ width:52px; height:52px; border-radius:14px; font-size:18px; margin-bottom:0; }

.lr-clickable{ background:none; border:none; text-align:left; font-family:inherit; cursor:pointer; flex:1; }
.edit-row{ display:flex; gap:8px; align-items:center; flex:1; flex-wrap:wrap; }
.edit-block{ padding:16px 0; border-top:1px solid var(--border-soft); }
.edit-block:first-of-type{ border-top:none; }
.checkbox-list{ display:flex; flex-direction:column; gap:9px; }
.checkbox-item{ display:flex; align-items:center; gap:9px; font-size:14.5px; color:var(--text-dim); cursor:pointer; }
.checkbox-item input{ width:16px; height:16px; accent-color:var(--accent); }
.equipment-history{ padding:4px 0 12px 4px; }

.back-btn{ background:none; border:none; color:var(--text-dim); font-size:14px; font-weight:700; padding:0; margin-bottom:16px; cursor:pointer; }
.back-btn:hover{ color:var(--text); }
.club-detail-head{ display:flex; align-items:center; gap:16px; margin-bottom:20px; }
.club-detail-name{ font-size:22px; font-weight:800; }

.stat-delta{ font-size:12.5px; font-weight:700; margin-top:6px; }
.stat-delta.pos{ color:var(--green); }
.stat-delta.neg{ color:var(--danger); }
.tab{ display:flex; align-items:center; gap:7px; background:var(--surface); border:1px solid var(--border-soft); color:var(--text-dim); padding:9px 15px; border-radius:22px; font-size:14.5px; font-weight:700; white-space:nowrap; transition:all .12s; }
.tab-dot{ width:6px; height:6px; border-radius:50%; flex-shrink:0; }


.alert-row{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
.alert-chip{ border:none; border-radius:20px; padding:9px 14px; font-size:14px; font-weight:700; }

.feed-row{ display:flex; align-items:flex-start; gap:11px; padding:11px 0; border-top:1px solid var(--border-soft); }
.feed-row:first-of-type{ border-top:none; }
.feed-dot{ width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }
.feed-title{ font-size:15px; font-weight:600; }
.feed-meta{ font-size:13.5px; color:var(--text-faint); margin-top:2px; }

.breakdown-row{ padding:10px 0; }
.breakdown-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; font-size:14px; }
.breakdown-label{ display:flex; align-items:center; font-weight:600; color:var(--text-dim); }
.breakdown-track{ height:8px; border-radius:6px; background:var(--surface-2); overflow:hidden; }
.breakdown-fill{ height:100%; border-radius:6px; transition:width .3s ease; }

.card{ background:var(--surface); border:1px solid var(--border-soft); border-radius:18px; padding:22px; }
.card h2{ font-size:19px; font-weight:800; margin-bottom:4px; }
.muted{ color:var(--text-dim); font-size:14.5px; margin-bottom:14px; }
.muted.center{ text-align:center; }
.muted.pad{ padding:20px 0; }

.field{ display:block; margin-bottom:12px; }
.field-label{ display:block; font-size:14px; color:var(--text-dim); margin-bottom:6px; font-weight:600; }

.btn{ border-radius:10px; padding:11px 16px; font-weight:700; font-size:15.5px; border:1px solid transparent; transition:all .12s; }
.btn-primary{ background:linear-gradient(135deg,var(--accent),var(--accent-2)); color:#FFFFFF; box-shadow:0 6px 20px -6px rgba(79,142,247,0.55); }
.btn-primary:hover{ filter:brightness(1.06); transform:translateY(-1px); }
.btn-ghost{ background:var(--surface-2); color:var(--text-dim); border-color:var(--border-soft); }
.btn-ghost:hover{ color:var(--text); }
.btn-danger-armed{ background:var(--danger-wash); color:var(--danger); border-color:var(--danger); }
.btn-block{ width:100%; display:block; text-align:center; }
.btn-sm{ padding:7px 12px; font-size:14px; }
.btn-row{ display:flex; gap:10px; margin-top:16px; }
.btn-row .btn{ flex:1; }

.kv{ display:flex; align-items:center; justify-content:space-between; padding:9px 0; font-size:15px; color:var(--text-dim); border-top:1px solid var(--border-soft); }
.kv:first-of-type{ border-top:none; }
.kv b{ color:var(--text); }
.kv b.ok{ color:var(--accent); }
.kv b.warn{ color:var(--warn); }
.ok{ color:var(--accent); }
.warn{ color:var(--warn); }

.subhead{ font-size:14px; font-weight:700; color:var(--text-dim); margin:20px 0 8px; }
.expense-row{ display:grid; grid-template-columns:1fr 90px auto; gap:8px; margin-bottom:6px; }
.reconcile{ margin-top:14px; padding:14px 16px; background:var(--surface-2); border-radius:12px; border:1px solid var(--border-soft); }
.link-x{ background:none; border:none; color:var(--text-faint); margin-left:8px; cursor:pointer; }

.banner{ background:var(--accent-wash); color:var(--accent); padding:11px 15px; border-radius:11px; font-size:14.5px; margin-bottom:14px; font-weight:600; border:1px solid rgba(166,255,63,0.25); }
.banner.warn{ background:var(--warn-wash); color:var(--warn); border-color:rgba(255,138,76,0.3); }
.banner.ok{ background:var(--accent-wash); color:var(--accent); border-color:rgba(166,255,63,0.25); }

.list-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 0; border-top:1px solid var(--border-soft); }
.list-row:first-of-type{ border-top:none; }
.list-row.col{ flex-direction:column; align-items:stretch; }
.lr-title{ font-weight:700; font-size:15.5px; display:flex; align-items:center; }
.lr-meta{ font-size:13.5px; color:var(--text-faint); margin-top:3px; }
.lr-desc{ font-size:14px; color:var(--text-dim); margin-top:4px; }
.row-align{ display:flex; align-items:center; gap:10px; }
.row-between{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.row-between.full{ width:100%; margin-bottom:0; }
.shift-detail{ display:flex; gap:16px; flex-wrap:wrap; font-size:14px; color:var(--text-dim); margin-top:10px; }
.cat-dot{ width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:8px; flex-shrink:0; }

.pill{ font-size:13px; font-weight:700; padding:5px 12px; border-radius:20px; white-space:nowrap; border:none; }
.pill.warn{ background:var(--warn-wash); color:var(--warn); }
.pill.ok{ background:var(--accent-wash); color:var(--accent); }
.pill.clickable{ cursor:pointer; }

.section-card{ background:var(--surface); border:1px solid var(--border-soft); border-radius:18px; padding:22px; margin-bottom:14px; }
.section-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
.section-head h2{ font-size:18px; font-weight:800; }
.count{ font-size:13px; font-weight:700; color:var(--accent); background:var(--accent-wash); padding:3px 10px; border-radius:20px; }
.link-btn{ background:none; border:none; color:var(--accent); font-size:13.5px; font-weight:700; }

table{ width:100%; border-collapse:collapse; margin-top:10px; }
thead th{ text-align:left; font-size:13px; color:var(--text-faint); font-weight:600; padding:8px 6px; }
tbody td{ padding:12px 6px; border-top:1px solid var(--border-soft); font-size:15px; }
.club-name{ font-weight:700; }

.stats{ display:grid; grid-template-columns:repeat(2,1fr); gap:11px; margin-bottom:18px; }
.stat-card{ background:var(--surface); border:1px solid var(--border-soft); border-radius:16px; padding:15px 17px; transition:transform .15s, border-color .15s; }
.stat-card:hover{ transform:translateY(-2px); border-color:var(--border); }
.stat-head{ display:flex; align-items:center; gap:8px; color:var(--text-dim); font-size:13.5px; font-weight:600; margin-bottom:9px; }
.stat-head .ic{ width:24px; height:24px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:14px; }
.stat-value{ font-size:23.5px; font-weight:700; letter-spacing:-0.3px; }

.seg{ display:flex; gap:4px; background:var(--surface-2); border-radius:20px; padding:3px; border:1px solid var(--border-soft); }
.seg-btn{ background:none; border:none; color:var(--text-dim); font-size:14px; font-weight:700; padding:7px 13px; border-radius:16px; }
.seg-btn.on{ background:linear-gradient(135deg,var(--accent),var(--accent-2)); color:#FFFFFF; }

.form-grid{ display:grid; grid-template-columns:1fr 1fr; gap:0 12px; }
.pin-input-row{ display:flex; gap:8px; }

@media (max-width:520px){
  .stats{ grid-template-columns:1fr 1fr; }
  .pin-pad{ grid-template-columns:repeat(3,58px); }
  .pin-key{ width:58px; height:58px; }
  .form-grid{ grid-template-columns:1fr; }
  .expense-row{ grid-template-columns:1fr 70px auto; }
}
`;
