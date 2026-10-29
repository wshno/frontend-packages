# @wshno/prettier-config

Shared Prettier config: single quotes, no semicolons, trailing commas everywhere, width 120, LF line
endings.

```bash
npm install --save-dev prettier @wshno/prettier-config
```

In `package.json`:

```json
{
  "prettier": "@wshno/prettier-config"
}
```

To override a setting, use a `prettier.config.js` instead:

```js
import config from '@wshno/prettier-config' with { type: 'json' }

export default { ...config, printWidth: 100 }
```
