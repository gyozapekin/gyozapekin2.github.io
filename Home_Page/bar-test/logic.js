// Bar PEKIN 売上管理 計算ロジック(純粋関数のみ)
// 対象REQ: REQ-F01(合計自動計算) REQ-F03(差額) REQ-F05(経費集計) REQ-F06(休業) REQ-F14(入力者記録)
// UIから分離してnodeで単体テストできるようにしている。

// 売上合計: items配列 [{unitPrice, qty}] の合計
export function calcSalesTotal(items) {
  return (items || []).reduce(function (sum, it) {
    var p = Number(it.unitPrice) || 0;
    var q = Number(it.qty) || 0;
    return sum + p * q;
  }, 0);
}

// 決済差額: (現金+キャッシュレス) - 売上合計。0なら一致
export function calcPaymentDiff(salesTotal, cash, cashless) {
  return (Number(cash) || 0) + (Number(cashless) || 0) - (Number(salesTotal) || 0);
}

// その他売上(スペシャルメニュー等の自由入力)の妥当性: 金額が正。名称は空なら「その他」
export function isValidExtra(e) {
  return !!e && (Number(e.amount) || 0) > 0;
}

// その他売上の合計
export function calcExtrasTotal(extras) {
  return (extras || []).filter(isValidExtra).reduce(function (sum, e) {
    return sum + Number(e.amount);
  }, 0);
}

// 経費合計
export function calcExpensesTotal(expenses) {
  return (expenses || []).reduce(function (sum, e) {
    return sum + (Number(e.amount) || 0);
  }, 0);
}

// 経費行の妥当性: 内容あり・金額が正・区分が3種のいずれか
export var EXPENSE_CATEGORIES = ['仕入', '消耗品', 'その他'];
export function isValidExpense(e) {
  return !!e && typeof e.label === 'string' && e.label.trim() !== ''
    && (Number(e.amount) || 0) > 0
    && EXPENSE_CATEGORIES.indexOf(e.category) >= 0;
}

// 日付ID(YYYY-MM-DD)。ローカル時刻基準
export function toDateId(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// 保存ドキュメントの組み立て
// opts: { dateId, isOpen, items, cash, cashless, guests, groups, expenses,
//         weather, memo, user:{uid, displayName}, existingCreatedAt, now }
export function buildDailyDoc(opts) {
  var items = (opts.items || []).map(function (it) {
    return {
      key: String(it.key),
      label: String(it.label),
      unitPrice: Number(it.unitPrice) || 0,
      qty: opts.isOpen ? (Number(it.qty) || 0) : 0
    };
  });
  var extras = opts.isOpen
    ? (opts.extras || []).filter(isValidExtra).map(function (e) {
        var label = (e.label == null ? '' : String(e.label)).trim();
        return { label: label === '' ? 'その他' : label, amount: Number(e.amount) };
      })
    : [];
  var salesTotal = opts.isOpen ? calcSalesTotal(items) + calcExtrasTotal(extras) : 0;
  var expenses = (opts.expenses || []).filter(isValidExpense).map(function (e) {
    return { label: e.label.trim(), amount: Number(e.amount), category: e.category };
  });
  var doc = {
    date: opts.dateId,
    isOpen: !!opts.isOpen,
    items: items,
    extras: extras,
    salesTotal: salesTotal,
    payments: {
      cash: opts.isOpen ? (Number(opts.cash) || 0) : 0,
      cashless: opts.isOpen ? (Number(opts.cashless) || 0) : 0
    },
    expenses: expenses,
    enteredBy: { uid: opts.user.uid, displayName: opts.user.displayName || '' },
    createdAt: opts.existingCreatedAt || opts.now,
    updatedAt: opts.now
  };
  if (opts.guests !== '' && opts.guests != null) doc.guests = Number(opts.guests) || 0;
  if (opts.groups !== '' && opts.groups != null) doc.groups = Number(opts.groups) || 0;
  if (opts.weather) doc.weather = opts.weather;
  if (opts.memo && String(opts.memo).trim() !== '') doc.memo = String(opts.memo).trim();
  return doc;
}

// ============================================================
// フェーズ3: 月次集計(純粋関数のみ)
// 対象REQ: REQ-F09(月次表示) REQ-F10(打ち忘れ検知) REQ-F11(月末締め)
//          REQ-F15(売上分配) REQ-F17(その他売上を集計に含む)
// ============================================================

// 'YYYY-MM' の桁数チェック
function isYearMonth(ym) {
  return typeof ym === 'string' && /^\d{4}-\d{2}$/.test(ym);
}

// その月の日数(monthは1-12)
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// 'YYYY-MM' から その月の全日付ID配列を返す
export function enumerateMonthDates(ym) {
  if (!isYearMonth(ym)) return [];
  var parts = ym.split('-').map(Number);
  var y = parts[0], m = parts[1];
  var n = daysInMonth(y, m);
  var out = [];
  for (var d = 1; d <= n; d++) {
    out.push(ym + '-' + String(d).padStart(2, '0'));
  }
  return out;
}

// 適用開始月つき分配比率履歴から、対象月に有効な北京取り分(pekinShare)を返す。
// shareRatio: [{effectiveFrom:'YYYY-MM', pekinShare:0.3}, ...]
// 対象月 ym 以下で最も新しい effectiveFrom を採用。該当なしは既定0.3。
export function getPekinShareForMonth(shareRatio, ym) {
  var DEFAULT = 0.3;
  if (!Array.isArray(shareRatio) || !isYearMonth(ym)) return DEFAULT;
  var applicable = shareRatio
    .filter(function (r) { return r && isYearMonth(r.effectiveFrom) && r.effectiveFrom <= ym; })
    .sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? -1 : 1; });
  if (applicable.length === 0) return DEFAULT;
  var v = Number(applicable[applicable.length - 1].pekinShare);
  return (v >= 0 && v <= 1) ? v : DEFAULT;
}

// 1日次レコードの売上合計を再計算(保存済みsalesTotalが無い場合の保険。items+extras)
export function recordSalesTotal(rec) {
  if (!rec || rec.isOpen === false) return 0;
  if (typeof rec.salesTotal === 'number') return rec.salesTotal;
  return calcSalesTotal(rec.items) + calcExtrasTotal(rec.extras);
}

// 月次サマリー。records はその月の日次ドキュメント配列(dateフィールドを持つ)。
// 月末締め(REQ-F11)は呼び出し側が当月分のみ渡す前提だが、ここでも ym で絞り込む。
export function calcMonthlySummary(records, ym, shareRatio) {
  var recs = (records || []).filter(function (r) {
    return r && typeof r.date === 'string' && r.date.slice(0, 7) === ym;
  });

  var salesTotal = 0, cash = 0, cashless = 0;
  var expenseByCategory = { '仕入': 0, '消耗品': 0, 'その他': 0 };
  var expensesTotal = 0;
  var openDays = 0, closedDays = 0;
  var guestsSum = 0, groupsSum = 0, salesWithGuests = 0;

  recs.forEach(function (r) {
    if (r.isOpen === false) { closedDays++; return; }
    openDays++;
    var st = recordSalesTotal(r);
    salesTotal += st;
    if (r.payments) {
      cash += Number(r.payments.cash) || 0;
      cashless += Number(r.payments.cashless) || 0;
    }
    (r.expenses || []).forEach(function (e) {
      var amt = Number(e.amount) || 0;
      expensesTotal += amt;
      if (expenseByCategory[e.category] == null) expenseByCategory[e.category] = 0;
      expenseByCategory[e.category] += amt;
    });
    if (r.guests != null && Number(r.guests) > 0) {
      guestsSum += Number(r.guests) || 0;
      salesWithGuests += st;
    }
    if (r.groups != null) groupsSum += Number(r.groups) || 0;
  });

  var pekinShare = getPekinShareForMonth(shareRatio, ym);
  var pekinAmount = Math.round(salesTotal * pekinShare);
  var centertailAmount = salesTotal - pekinAmount; // 端数はセンターテール側に寄せ、合計を一致させる
  var centertailBalance = centertailAmount - expensesTotal; // センターテール収支(粗利は使わない・設計D-10)

  return {
    ym: ym,
    salesTotal: salesTotal,
    payments: { cash: cash, cashless: cashless },
    expensesTotal: expensesTotal,
    expenseByCategory: expenseByCategory,
    openDays: openDays,
    closedDays: closedDays,
    recordedDays: recs.length,
    dailyAverage: openDays > 0 ? Math.round(salesTotal / openDays) : 0,
    guestsSum: guestsSum,
    groupsSum: groupsSum,
    avgPerGuest: guestsSum > 0 ? Math.round(salesWithGuests / guestsSum) : null,
    share: {
      pekinShare: pekinShare,
      centertailShare: Math.round((1 - pekinShare) * 1000) / 1000,
      pekinAmount: pekinAmount,
      centertailAmount: centertailAmount
    },
    centertailBalance: centertailBalance
  };
}

// 前月比(売上合計)。previousが0/未指定なら null(比較不能)。百分率(小数1桁)。
export function calcMonthOverMonth(currentSales, previousSales) {
  var cur = Number(currentSales) || 0;
  var prev = Number(previousSales) || 0;
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

// 打ち忘れ検知(REQ-F10)。対象月のうち、営業予定曜日(businessDays)で
// today以前なのにレコードが無い日付IDの配列を返す。未来日は対象外。
// records: 日次ドキュメント配列(date を持つ)。businessDays: [0..6](0=日)。
// today: 'YYYY-MM-DD' 文字列(基準日。省略時は判定に含めない=全予定日を対象)。
export function findMissingBusinessDays(ym, businessDays, records, today) {
  if (!isYearMonth(ym)) return [];
  var bd = Array.isArray(businessDays) ? businessDays : [];
  var have = {};
  (records || []).forEach(function (r) { if (r && r.date) have[r.date] = true; });
  var out = [];
  enumerateMonthDates(ym).forEach(function (id) {
    if (today && id > today) return;            // 未来日は打ち忘れにしない
    var parts = id.split('-').map(Number);
    var dow = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    if (bd.indexOf(dow) < 0) return;            // 営業予定日でない
    if (!have[id]) out.push(id);
  });
  return out;
}
