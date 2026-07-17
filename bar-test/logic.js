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
  var salesTotal = opts.isOpen ? calcSalesTotal(items) : 0;
  var expenses = (opts.expenses || []).filter(isValidExpense).map(function (e) {
    return { label: e.label.trim(), amount: Number(e.amount), category: e.category };
  });
  var doc = {
    date: opts.dateId,
    isOpen: !!opts.isOpen,
    items: items,
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
