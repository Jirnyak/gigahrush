# Localization Pipeline

Русский текст в исходниках остаётся каноном. Другие языки не пишутся поверх русского контента и не переводятся автоматически при добавлении нового модуля.

For English term choices, use `Docs/Localization/en-style.md`.

## Commands

- `npm run l10n:audit` scans player-facing text and compares it with `locales/*.json`.
- `npm run l10n:report` writes `Docs/Localization/audit.json` and `Docs/Localization/missing-<locale>.md`.
- `npm run l10n:seed -- --locale en` merges missing canonical strings into `locales/en.json` as `todo` records without overwriting existing translations.
- `npm run l10n:apply -- --locale en --file locales/_en_core.json --write` applies a reviewed translation batch and validates placeholders before writing.
- `npm run l10n:extract` keeps the scenario-writer inventory at `Docs/ScenarioWriters/game_text_inventory.md`.

## Locale Files

Translations live in `locales/<locale>.json`:

```json
{
  "locale": "en",
  "sourceLocale": "ru",
  "entries": {
    "gt_example": {
      "source": "Русская каноническая строка",
      "translation": "",
      "status": "todo",
      "notes": ""
    }
  }
}
```

`entries` may stay empty. The audit will report every canonical Russian string as missing until a translation record is added. Running `l10n:seed` turns missing strings into explicit `todo` records with source text, placeholders and first occurrence, so translators can work in one stable locale file.

Batch files whose names start with `_`, such as `locales/_en_core.json`, are ignored by the audit and can store reviewed translation batches:

```json
{
  "entries": {
    "gt_example": "English translation"
  }
}
```

## Rules

- Add new game/content text in Russian first.
- Do not add automatic translation to content modules.
- Preserve placeholders such as `${value}`, `{dir}` and `%s` in translations.
- Keep `status: "todo"` until an English line is intentionally translated and checked.
- If a template placeholder contains Russian fallback text inside `${...}`, split that source expression before expecting a fully clean runtime translation.
- If Russian source text changes, the old translation id becomes orphaned and the changed source appears as missing.
- To add another language, create `locales/<code>.json` with an empty `entries` object and run `npm run l10n:audit -- --locale <code>`.
