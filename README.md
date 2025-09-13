# HR Orientation

## Side Panel

The application includes an account and settings side panel on the right. On small screens the
panel slides in when the chevron toggle at the screen edge is tapped and closes when the backdrop is clicked or the
Escape key is pressed. On larger screens it remains visible.

The panel container uses the shared `card` class, while its buttons and form fields use the
common `btn` and `input` classes to keep styling consistent across the app.

## Default Role

New accounts created through the local registration endpoint are automatically assigned a role.
Set the `DEFAULT_ROLE` variable in your `.env` to choose which role is used. If not specified,
`trainee` is applied. This allows administrators to grant elevated access (for example, `admin`)
during initial setup.
