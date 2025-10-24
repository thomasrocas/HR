# HR Orientation

## Side Panel

The application includes an account and settings side panel on the right. On small screens the
panel slides in when the chevron toggle at the screen edge is tapped and closes when the backdrop is clicked or the
Escape key is pressed. On larger screens it remains visible.

The panel now shares styling tokens with the admin role manager. Wrap the outer container in a
`panel` class and any nested sections in `panel-section` to inherit the rounded corners, borders, and
surface colors. Buttons inside the panel should use the base `btn` class with one of the variants
(`btn-primary`, `btn-outline`, or `btn-ghost`). Form inputs share the `form-field` utility (alias `input`).
This keeps typography, spacing, and focus states consistent across admin pages.

## Design tokens & utilities

Color variables are defined in `src/styles.css` (`--brand-primary`, `--surface`, `--text-muted`, etc.)
and mirrored in `tailwind.config.ts` as the `brand`, `surface`, `ink`, `border`, and `focus` color
groups. Use the Tailwind classes generated from these tokens (`bg-surface`, `bg-surface-alt`,
`text-ink`, `text-ink-muted`, `border-border`, `ring-focus`) to keep layouts on brand without
falling back to arbitrary values.

Shared component classes introduced for the role manager:

- `panel` and `panel-section` – Card containers with rounded corners, border, and subtle shadowing
  for primary and nested sections respectively.
- `label-text` – Uppercase caption styling for field labels.
- `form-field` / `input` – Rounded text input with shared focus ring using the `focus` token.
- `btn` – Base button styling with consistent spacing, rounded corners, disabled states, and
  accessible focus ring. Pair with:
  - `btn-primary` for filled actions using the brand color.
  - `btn-outline` for neutral bordered actions on surface backgrounds.
  - `btn-ghost` for low-emphasis text buttons.

When creating new interactions, prefer these utilities over bespoke styles so future contributors
inherit the same spacing, typography, and color behavior.

## Migrations

Run the SQL files in the `migrations/` directory in order. After applying `002_rbac.sql`, run `003_seed_admin.sql`
to create a default local account (`admin` / `changeme`) and grant it the `admin` role. This ensures at least one
user can manage roles for others after initial deployment.

---

## Monorepo layout

```
apps/
  client/
    src/
      components/
      pages/
      services/
      utils/
  server/
    src/
      config/
      routes/
      controllers/
      services/
      middlewares/
      utils/
      legacy/
    tests/
packages/
  shared/
    src/
      constants/
      types/
      validators/
```

The existing application code remains in place while the monorepo skeleton is introduced. Future steps will gradually
move logic into the new structure without changing runtime behavior.

## Setup

1. Install dependencies:
   ```sh
   npm install
   ```
2. Copy `.env.example` to `.env` and update the values for your environment.
3. Ensure PostgreSQL is running and the database defined by `DATABASE_URL` exists.
4. Apply the SQL migrations under `migrations/` in order.

## Development

Start the existing server entry point:

```sh
npm run start
```

This command keeps the current flat server running while the new monorepo layout is staged.

## Testing

Run the available Jest tests:

```sh
npm test
```

## Docker

A Docker setup will be documented once the server has been fully migrated into the monorepo structure.
