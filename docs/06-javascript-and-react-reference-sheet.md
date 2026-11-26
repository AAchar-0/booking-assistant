# Reference Sheet 06: JavaScript, Node, Express and React

The runnable version of the language part is `docs/javascript-tour.mjs`: `node docs/javascript-tour.mjs`.

## JavaScript you will meet in this project
```js
const x = 1; let y = 2;                         // const cannot be re-assigned; avoid var
const { a, b = 5, ...rest } = object;           // destructuring: names, defaults, "the rest"
const copy = { ...object, a: 9 };               // copy with one change
const list = [...old, newItem];                 // copy with an extra item
value ?? 'default'                              // default only for null/undefined (|| also replaces 0 and '')
user?.profile?.name                             // stops quietly if something is missing
items.map(f)  items.filter(f)  items.find(f)  items.some(f)  items.reduce((sum, i) => sum + i, 0)
`Hello ${name}`                                 // template string
export function f() {}   import { f } from './f.js'   // modules (the .js ending is required in Node)
```

## Async: waiting without freezing
```js
async function load() {
  try {
    const response = await fetch('/api/services');      // pauses THIS function only
    if (!response.ok) throw new Error(response.status);
    return await response.json();
  } catch (e) { console.error(e); }                     // network and thrown errors land here
}
await Promise.all([a(), b()]);        // run together, fail if any fails
await Promise.allSettled([a(), b()]); // run together, report each result
```
Rule: a function with `await` inside must be marked `async`, and it returns a Promise.

## Node
| Task | Command |
|---|---|
| Run a file | `node file.js` |
| Run the tests | `npm test` (uses the built-in `node:test`) |
| Install packages | `npm install` (reads package.json, writes package-lock.json: commit that file) |
| Set a variable for this terminal | `$env:NAME = "value"` (PowerShell) |
| Read a variable in code | `process.env.NAME` |

## Express in five lines
```js
const app = express();
app.use(express.json());                        // turns a JSON body into req.body
app.get('/api/items/:id', async (req, res) => res.json({ id: req.params.id }));   // req.params, req.query, req.body
app.use((err, req, res, next) => res.status(500).json({ error: 'oops' }));        // 4 arguments = error handler
app.listen(8080);
```
Middleware (`app.use(fn)`) runs in the order written. Call `next()` to continue or `next(error)` to jump to the error handler.

## React in five ideas
```jsx
function Counter({ start }) {                   // a component: a function that returns JSX
  const [n, setN] = useState(start);            // state: when it changes, the component redraws
  useEffect(() => { document.title = n; }, [n]);// side effects: runs after drawing, again only when n changes
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
```
- Props flow down (`<Counter start={3} />`); events flow up (callbacks).
- Lists need a stable `key`: `items.map((i) => <li key={i.id}>{i.name}</li>)`.
- Never change state directly: `setItems([...items, x])`, not `items.push(x)`.
- JSX escapes text for you, which is why `{userText}` is safe and `dangerouslySetInnerHTML` is not.
- `useEffect` returning a function cleans up (cancel a request, remove a listener).

## SQL used here
```sql
SELECT b.*, s.name FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.starts_at >= $1;
INSERT INTO users (email, ...) VALUES ($1, ...) RETURNING *;       -- $1 placeholders stop SQL injection
UPDATE services SET name = COALESCE($2, name) WHERE id = $1;       -- keep the old value when $2 is null
```
