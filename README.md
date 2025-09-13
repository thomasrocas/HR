# HR Orientation

## Side Panel

The application includes an account and settings side panel on the right. On small screens the
panel slides in when the chevron toggle at the screen edge is tapped and closes when the backdrop is clicked or the
Escape key is pressed. On larger screens it remains visible.

The panel container uses the shared `card` class, while its buttons and form fields use the
common `btn` and `input` classes to keep styling consistent across the app.

## Migrations

Run the SQL files in the `migrations/` directory in order. After applying `002_rbac.sql`, run `003_seed_admin.sql`
to create a default local account (`admin` / `changeme`) and grant it the `admin` role. This ensures at least one
user can manage roles for others after initial deployment.
