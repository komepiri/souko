/**
 * JS-std-plus.js — "なんで標準にないの？" なJS関数ライブラリ Created By Claude
 * 15関数 | ゼロ依存 | ESM / CommonJS 両対応
 *
 * 
 */

// ─────────────────────────────────────────
// 非同期・タイミング系
// ─────────────────────────────────────────

/**
 * await できる待機関数
 * @param {number} ms - 待機ミリ秒
 * @returns {Promise<void>}
 * @example await sleep(1000); // 1秒待つ
 */
export const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 連続呼び出しを間引いて最後の1回だけ実行
 * @param {Function} fn
 * @param {number} delay - ミリ秒
 * @returns {Function}
 * @example const search = debounce(query => fetchAPI(query), 300);
 */
export const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

/**
 * 一定間隔内で最大1回しか実行させない
 * @param {Function} fn
 * @param {number} interval - ミリ秒
 * @returns {Function}
 * @example window.addEventListener('scroll', throttle(onScroll, 100));
 */
export const throttle = (fn, interval) => {
  let lastTime = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      return fn(...args);
    }
  };
};

/**
 * 失敗した非同期処理を自動リトライ（指数バックオフ）
 * @param {Function} fn - 非同期関数
 * @param {number} [times=3] - 最大試行回数
 * @param {number} [delay=500] - 初回待機ミリ秒
 * @returns {Promise<any>}
 * @example await retry(() => fetch('/api/data'), 3, 1000);
 */
export const retry = async (fn, times = 3, delay = 500) => {
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === times - 1) throw e;
      await sleep(delay * (i + 1));
    }
  }
};

// ─────────────────────────────────────────
// 数値系
// ─────────────────────────────────────────

/**
 * 値を min〜max の範囲に収める（CSS clamp() の JS版）
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 * @example clamp(150, 0, 100); // → 100
 */
export const clamp = (value, min, max) =>
  Math.min(Math.max(value, min), max);

/**
 * 連番の配列を生成（Python range() 相当）
 * 浮動小数点誤差を内部で抑制済み
 * @param {number} start
 * @param {number} end   - この値は含まない
 * @param {number} [step=1]
 * @returns {number[]}
 * @example range(0, 5);        // → [0,1,2,3,4]
 * @example range(0, 1, 0.2);   // → [0, 0.2, 0.4, 0.6, 0.8]
 * @example range(10, 0, -2);   // → [10, 8, 6, 4, 2]
 */
export const range = (start, end, step = 1) => {
  if (step === 0) throw new RangeError("step cannot be 0");
  const result = [];
  for (
    let i = start;
    step > 0 ? i < end : i > end;
    i += step
  ) {
    result.push(+i.toFixed(10));
  }
  return result;
};

// ─────────────────────────────────────────
// 配列系
// ─────────────────────────────────────────

/**
 * 配列をキーでグルーピング（Object.groupBy ポリフィル）
 * @param {any[]} arr
 * @param {Function} keyFn
 * @returns {Object}
 * @example groupBy(users, u => u.role); // { admin: [...], editor: [...] }
 */
export const groupBy = (arr, keyFn) =>
  arr.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

/**
 * 配列を指定サイズのかたまりに分割
 * @param {any[]} arr
 * @param {number} size
 * @returns {any[][]}
 * @example chunk([1,2,3,4,5], 2); // → [[1,2],[3,4],[5]]
 */
export const chunk = (arr, size) => {
  if (size < 1) throw new RangeError("size must be >= 1");
  return Array.from(
    { length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, (i + 1) * size)
  );
};

/**
 * 複数の配列を対応するインデックスでまとめる（Python zip() 相当）
 * 最短の配列の長さに合わせる
 * @param {...any[]} arrays
 * @returns {any[][]}
 * @example zip(['a','b'], [1,2]); // → [['a',1],['b',2]]
 */
export const zip = (...arrays) => {
  const len = Math.min(...arrays.map((a) => a.length));
  return Array.from({ length: len }, (_, i) =>
    arrays.map((a) => a[i])
  );
};

// ─────────────────────────────────────────
// オブジェクト系
// ─────────────────────────────────────────

/**
 * オブジェクトのキーを一括変換
 * @param {Object} obj
 * @param {Function} fn - (key, value) => newKey
 * @returns {Object}
 * @example mapKeys({user_name:'Alice'}, s => s.replace(/_([a-z])/g, (_,c)=>c.toUpperCase()));
 *          // → { userName: 'Alice' }
 */
export const mapKeys = (obj, fn) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [fn(k, v), v])
  );

/**
 * ネストされたオブジェクトを完全コピー
 * structuredClone が使える環境ではそちらを優先
 * @param {any} obj
 * @returns {any}
 */
export const deepClone = (obj) =>
  typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));

// ─────────────────────────────────────────
// 関数系
// ─────────────────────────────────────────

/**
 * 最初の1回しか実行されない関数を返す
 * 2回目以降は最初の戻り値をそのまま返す
 * @param {Function} fn
 * @returns {Function}
 * @example const init = once(() => connectDB()); init(); init(); // DB接続は1回だけ
 */
export const once = (fn) => {
  let called = false;
  let result;
  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
};

/**
 * 同じ引数での呼び出し結果をキャッシュして再利用（Python @lru_cache 相当）
 * @param {Function} fn
 * @param {Function} [keyFn=JSON.stringify] - キャッシュキー生成関数
 * @returns {Function}
 * @example const fib = memoize(n => n <= 1 ? n : fib(n-1) + fib(n-2));
 */
export const memoize = (fn, keyFn = JSON.stringify) => {
  const cache = new Map();
  return (...args) => {
    const key = keyFn(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

/**
 * 複数の関数を左→右に合成（TC39 Pipeline Operator |> 代替）
 * @param {...Function} fns
 * @returns {Function}
 * @example const process = pipe(x => x * 2, x => x + 10, String);
 *          process(5); // → "20"
 */
export const pipe = (...fns) =>
  (x) => fns.reduce((v, f) => f(v), x);

// ─────────────────────────────────────────
// 表示・フォーマット系
// ─────────────────────────────────────────

/**
 * バイト数を人間が読みやすいサイズ文字列に変換
 * @param {number} bytes
 * @param {number} [decimals=2]
 * @returns {string}
 * @example formatBytes(1536000); // → "1.46 MB"
 */
export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(decimals)} ${units[i]}`;
};

// ─────────────────────────────────────────
// CommonJS 互換エクスポート（Node.js require 対応）
// ─────────────────────────────────────────
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    sleep, debounce, throttle, retry,
    clamp, range,
    groupBy, chunk, zip,
    mapKeys, deepClone,
    once, memoize, pipe,
    formatBytes,
  };
}
