# Shape Format

A shape is a plain JavaScript representation of a data structure or format
that can be used to validate and/or generate data, in a way that is very
similar to what typescript does.

```javascript
const MessageShape = {
	// Set == enum
	origin: new Set(["user", "system", "assistant"]),
	created: Date,
	content: String,
};
```

A shape uses:
- `{}` to represent structures, fields suffixed by `?` are optional.
- `[V]` is the equivalent of `V[]` in TypeScript
- `new Set([A,B])` is the equivalent of `A|B` in TypeScript
- Type classes/constructors represent types (eg. `String` represents the `string` type)
- Values represent singletons
- `undefined` represents any
- a `Symbol` represents a slot, which can then be captured and mapped to other shapes


