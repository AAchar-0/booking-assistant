// JAVASCRIPT TOUR: a runnable refresher for the language features this project uses.
// Run it:   node docs/javascript-tour.mjs      (read the code and the output side by side)
// Lessons: 1 values, 2 strings, 3 arrays, 4 objects, 5 functions, 6 closures, 7 classes, 8 Map and Set,
//          9 errors, 10 modules, 11 the event loop, 12 promises and async/await, 13 generators, 14 dates and Intl, 15 regex and JSON

const title = (text) => console.log(`\n=== ${text} ===`);

// ---------------------------------------------------------------- 1. values
title('1. Values, let/const, equality, truthiness');
const fixed = 42;                       // const: the name cannot be pointed at something else
let counter = 0;                        // let: can change. (Do not use var: it has confusing scoping rules.)
counter += 1;
console.log(typeof fixed, typeof 'text', typeof true, typeof undefined, typeof null, typeof {}, typeof [], typeof (() => 1));
console.log('3 == "3":', 3 == '3', '| 3 === "3":', 3 === '3', '(always use ===)');
console.log('falsy values:', [0, '', null, undefined, NaN, false].map(Boolean));
console.log('0.1 + 0.2 =', 0.1 + 0.2, '-> never store money as decimals; this project stores whole cents');
const value = null;
console.log('nullish ??:', value ?? 'default', '| optional chaining ?.:', value?.name, '| || vs ??:', 0 || 'x', 0 ?? 'x');

// ---------------------------------------------------------------- 2. strings
title('2. Strings');
const name = 'Amina';
console.log(`Hello, ${name}! 2 + 2 = ${2 + 2}`);                       // template literal
console.log('a,b,c'.split(','), '  pad '.trim(), 'abc'.toUpperCase(), 'x'.padStart(3, '0'), 'hello'.includes('ell'), 'hello'.slice(1, 3));

// ---------------------------------------------------------------- 3. arrays
title('3. Arrays: map, filter, reduce, find, destructuring, spread');
const prices = [150, 80, 300, 420];
console.log('map   :', prices.map((p) => p * 2));
console.log('filter:', prices.filter((p) => p > 100));
console.log('reduce:', prices.reduce((sum, p) => sum + p, 0));
console.log('find  :', prices.find((p) => p > 200), '| some:', prices.some((p) => p > 400), '| every:', prices.every((p) => p > 50));
console.log('sort  :', [...prices].sort((a, b) => a - b), '(copy first: sort changes the original)');
const [first, , third, ...others] = ['a', 'b', 'c', 'd', 'e'];            // destructuring with a skip and "the rest"
console.log(first, third, others, '| spread:', [...[1, 2], ...[3]], '| at(-1):', prices.at(-1));
console.log('flat/flatMap:', [[1], [2, 3]].flat(), [1, 2].flatMap((n) => [n, n * 10]));

// ---------------------------------------------------------------- 4. objects
title('4. Objects: shorthand, destructuring, spread, entries');
const service = { id: 2, name: 'Follow-up', minutes: 15 };
const { name: serviceName, minutes, currency = 'KES' } = service;           // rename + default value
const updated = { ...service, minutes: 20 };                               // copy with one change (service is untouched)
console.log(serviceName, minutes, currency, updated, service.minutes);
console.log(Object.entries(service), Object.keys(service), Object.fromEntries([['a', 1]]));
const key = 'dynamic';
console.log({ [key]: true, service }, '| structuredClone makes a deep copy:', structuredClone({ a: { b: 1 } }));

// ---------------------------------------------------------------- 5. functions
title('5. Functions: arrow, default, rest, callbacks, higher-order');
function add(a, b = 10) { return a + b; }                                  // default parameter
const multiply = (a, b) => a * b;                                          // arrow function
const sumAll = (...numbers) => numbers.reduce((s, n) => s + n, 0);         // rest parameters
const compose = (f, g) => (x) => g(f(x));                                  // a function that returns a function
console.log(add(1), add(1, 2), multiply(3, 4), sumAll(1, 2, 3), compose((x) => x + 1, (x) => x * 2)(5));
console.log('callback:', [3, 1, 2].sort((a, b) => b - a));

// ---------------------------------------------------------------- 6. closures
title('6. Closures: a function remembers where it was created (used by the rate limiter)');
function makeCounter() {
  let count = 0;                                                           // private: only reachable through the returned functions
  return { next: () => ++count, peek: () => count };
}
const a = makeCounter(), b = makeCounter();
a.next(); a.next(); b.next();
console.log('a:', a.peek(), 'b:', b.peek(), '(each has its own hidden count)');

// ---------------------------------------------------------------- 7. classes
title('7. Classes: fields, private fields, getters, static, inheritance');
class Account {
  #balance = 0;                                                            // # = private: cannot be touched from outside
  static count = 0;
  constructor(owner) { this.owner = owner; Account.count++; }
  deposit(amount) { if (amount <= 0) throw new RangeError('amount must be positive'); this.#balance += amount; return this; }
  get balance() { return this.#balance; }                                  // read like a property: account.balance
  toString() { return `${this.owner}: ${this.#balance}`; }
}
class SavingsAccount extends Account {
  constructor(owner, rate) { super(owner); this.rate = rate; }             // super() runs the parent constructor
  addInterest() { return this.deposit(this.balance * this.rate); }
}
const savings = new SavingsAccount('Brian', 0.1).deposit(100).addInterest();
console.log(String(savings), '| instanceof Account:', savings instanceof Account, '| accounts created:', Account.count);

// ---------------------------------------------------------------- 8. Map and Set
title('8. Map and Set');
const counts = new Map();                                                  // like an object, but any key type and remembers order
for (const word of 'to be or not to be'.split(' ')) counts.set(word, (counts.get(word) ?? 0) + 1);
console.log(counts, [...counts].filter(([, n]) => n > 1), '| unique:', [...new Set([1, 2, 2, 3, 3, 3])]);

// ---------------------------------------------------------------- 9. errors
title('9. Errors: throw, try/catch/finally, custom errors');
class ValidationError extends Error {
  constructor(message, field) { super(message); this.name = 'ValidationError'; this.field = field; }
}
function parseAge(text) {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) throw new ValidationError('age must be a whole number', 'age');
  return n;
}
for (const input of ['30', 'abc']) {
  try { console.log('parsed', parseAge(input)); }
  catch (e) { console.log(e instanceof ValidationError ? `${e.name} on ${e.field}: ${e.message}` : 'unexpected', e.stack.split('\n')[0]); }
  finally { /* runs every time: close files, release locks */ }
}

// ---------------------------------------------------------------- 10. modules
title('10. Modules (how the files in this project connect)');
console.log(`In a file:  export function hello() {}   export default thing;
In another: import thing, { hello } from './file.js';
Loading on demand: const { createPgRepo } = await import('./pgRepo.js');   (used by the PostgreSQL tests)
This file is a module: top-level "await" works here (see lesson 12), and import.meta.url is`, import.meta.url.startsWith('file:'));

// ---------------------------------------------------------------- 11. event loop
title('11. The event loop: JavaScript runs one thing at a time');
console.log('1 first (synchronous)');
setTimeout(() => console.log('4 last (timer: waits until everything else is done)'), 0);
Promise.resolve().then(() => console.log('3 third (promise callbacks run before timers)'));
console.log('2 second (synchronous)');
await new Promise((resolve) => setTimeout(resolve, 10));                    // let the lines above print first

// ---------------------------------------------------------------- 12. promises and async/await
title('12. Promises and async/await');
const wait = (ms, value, fail = false) => new Promise((resolve, reject) => setTimeout(() => (fail ? reject(new Error(`${value} failed`)) : resolve(value)), ms));
console.log('await one :', await wait(5, 'result'));
console.log('in parallel:', await Promise.all([wait(20, 'A'), wait(5, 'B'), wait(10, 'C')]), '(order of the array, not of finishing)');
const settled = await Promise.allSettled([wait(5, 'ok'), wait(5, 'bad', true)]);      // never throws: reports each outcome
console.log('allSettled :', settled.map((s) => s.status), '| race:', await Promise.race([wait(30, 'slow'), wait(5, 'fast')]));
try { await wait(1, 'job', true); } catch (e) { console.log('caught   :', e.message); }
// The booking service uses exactly this: "await repo.createBooking(...)" inside try/catch, and
// Promise.allSettled in the tests to fire many requests at the same moment.
const results = await Promise.all([1, 2, 3].map(async (n) => { await wait(n, n); return n * n; }));
console.log('async map  :', results);

// ---------------------------------------------------------------- 13. generators and iterators
title('13. Generators and iterators');
function* range(from, to, step = 1) { for (let i = from; i < to; i += step) yield i; }   // yield pauses and hands out a value
console.log([...range(0, 10, 3)], '| lazy: nothing is computed until asked');
const iterable = { *[Symbol.iterator]() { yield 'x'; yield 'y'; } };
for (const item of iterable) console.log('iterated', item);

// ---------------------------------------------------------------- 14. dates and Intl
title('14. Dates and Intl (why this project stores UTC and converts for display)');
const moment = new Date('2026-11-27T07:00:00.000Z');                       // "Z" = UTC. Always include the zone in stored times.
console.log(moment.toISOString(), moment.getTime(), '(milliseconds since 1970)');
for (const timeZone of ['Africa/Nairobi', 'Europe/London', 'America/New_York']) {
  console.log(timeZone.padEnd(18), new Intl.DateTimeFormat('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(moment));
}
console.log(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'KES' }).format(1500), '|', (1234567.891).toLocaleString('en-US'));

// ---------------------------------------------------------------- 15. regex and JSON
title('15. Regular expressions and JSON');
const logLine = '- - 5 [26/Nov/2026:05:00:09 +0000] "GET /api/services HTTP/1.1" 200 512 7';
const match = logLine.match(/"(?<method>[A-Z]+) (?<path>\S+) HTTP\/1\.1" (?<status>\d{3})/);   // named capture groups
console.log({ ...match.groups }, '| test:', /^\d{4}-\d{2}-\d{2}$/.test('2026-11-27'), '| replace:', 'a-b-c'.replaceAll('-', '+'));
const text = JSON.stringify({ id: 1, tags: ['a'], when: moment, skip: undefined }, null, 2);       // objects -> text
console.log(text, '\nback:', JSON.parse(text));

console.log('\nEnd of tour.');
