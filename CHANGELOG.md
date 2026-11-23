# Changelog

Todos los cambios notables de Bolsillo están en este fichero. El formato sigue [Keep a Changelog 1.1.0](https://keepachangelog.com/es-ES/1.1.0/) y las versiones siguen [Semantic Versioning](https://semver.org/lang/es/).

All notable changes to Bolsillo are in this file. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

[ES](#español) | [EN](#english)

---

## Español

### [Sin publicar · Unreleased]

#### Cambiado

- La CI y el flujo de publicación usan `pnpm/action-setup` 6.1.1 (antes 6.1.0), fijado por SHA.

### [1.2.0] - 2026-11-19

Antes de actualizar, lee los avisos del final de esta versión y [`docs/MIGRACION.md`](docs/MIGRACION.md).

#### Añadido

- Importar extractos del banco en CSV o Excel (.xlsx) desde Movimientos. El asistente propone las columnas (fecha, concepto, importe o cargo y abono), entiende `1.234,56` y `1,234.56`, fechas `dd/mm/aaaa` y `aaaa-mm-dd`, CSV con `;`, `,` o tabulador, en UTF-8 o Windows-1252. Enseña una vista previa con los errores de cada fila y marca los posibles duplicados (lo que ya estaba apuntado y las filas repetidas en el fichero) con una casilla para incluir o excluir cada uno. Las columnas se pueden guardar como perfil del banco, que se reconoce solo la próxima vez. El fichero no se guarda: solo quedan los movimientos importados.
- Reglas de categoría en Ajustes: "si el concepto contiene X, la categoría es Y", con orden, activar o desactivar y solo para ingresos o solo para gastos. La importación las aplica; lo que no encaja va a "Otros". Cuando cambias a mano la categoría de un movimiento, Bolsillo lo anota y, si se repite, propone la regla con un botón para crearla.
- Fijos con frecuencia semanal, mensual, trimestral o anual, primer día opcional y fin por fecha o por número de cobros. Un semanal cuenta 4 o 5 veces en el mes, y uno trimestral o anual solo en sus meses. El formulario enseña la fecha del primer cobro, así se ve si el primer ciclo se salta (alta el día 20 con pago el día 5). Los avisos de pagos próximos siguen la frecuencia.
- Transferencias entre cuentas y "Ajustar saldo" en Cuentas. Una transferencia mueve el saldo de las dos cuentas sin contar como ingreso ni como gasto del mes. El ajuste deja la cuenta en el saldo que dice el banco en una fecha y apunta la diferencia aparte. Las dos cosas salen en un historial con opción de borrar.
- Copia cifrada (`.bolsillo`) con contraseña propia y los recibos dentro, copias automáticas en el equipo (las 10 últimas y una por día durante 30 días) que se restauran desde Ajustes, clave de recuperación, "Bloquear ahora" y autobloqueo por inactividad.
- Pantalla de rescate cuando los datos no se pueden leer, en vez de cargar el ejemplo encima, con copia del bloque ilegible.
- Aviso fijo si falla el guardado, con reintento automático y confirmación al cerrar con cambios sin guardar.
- La bienvenida pregunta si empezar vacío o con datos de ejemplo. En Ajustes hay "Empezar de cero" y "Cargar ejemplo".
- `CHANGELOG.md` y un flujo de publicación que compila los instaladores de Windows en un borrador de release y adjunta `SHA256SUMS`.

#### Cambiado

- Los datos se guardan en un fichero cifrado que escribe Rust (`datos.bolsillo`, escritura atómica), con AES-256-GCM y la clave derivada con Argon2id. Hasta la 1.1.0 iban en el `localStorage` del WebView con PBKDF2. Los recibos van en ficheros aparte, así que desaparece el tope de unos 5 MB.
- Esquema de datos versionado (ahora la versión 4) con migraciones paso a paso y validación de cada campo al abrir y al importar copias. Las fechas imposibles de versiones anteriores se corrigen y el valor original queda en una etiqueta.
- El patrimonio cuenta las transferencias y los ajustes de saldo.
- Las fuentes Syne y DM Sans van dentro de la app: no hay peticiones a Google Fonts.
- jsPDF solo se carga al exportar y ExcelJS al exportar o al importar un Excel. El bundle principal baja de unos 1.612 kB a unos 390 kB.
- Los diálogos son accesibles con teclado: `role="dialog"`, foco atrapado, cierre con `Esc` y nombre en botones de icono y campos.
- Exportar e importar abre los diálogos nativos desde Rust; el frontend ya no elige rutas.

#### Seguridad

- CSP definida en `tauri.conf.json` (en la 1.1.0 era `null`).
- Una sola instancia de la app, para que dos procesos no escriban a la vez el mismo fichero.
- Aviso de PIN débil y mínimos de credencial (PIN de 4 a 6 cifras, contraseña de 8 caracteres o más).

#### Arreglado

- Los formularios rechazan importes no válidos o por encima de 999.999.999,99 con un mensaje, en vez de guardar 0. Lo mismo vale para las partes de un gasto dividido y las aportaciones a un plan.
- Los importes se redondean en un único sitio (`utils/importe.ts`).

#### Avisos

- La primera vez que la 1.2.0 lee los datos de la 1.1.0, los migra al fichero cifrado. El `localStorage` de la 1.1.0 no se borra y conserva su protección de entonces. Cómo volver atrás: [`docs/MIGRACION.md`](docs/MIGRACION.md).
- Las copias de la 1.2.0 llevan `version: 4`. La 1.1.0 no conoce ese formato.
- Si usas la 1.1.0 después de migrar, lo que apuntes ahí no pasa solo a la 1.2.0: la app avisa y tendrás que importarlo a mano.
- El instalador sigue sin firmar. Comprueba la descarga con el fichero `SHA256SUMS` de la release.

### [1.1.0] - 2026-06-16

#### Añadido

- Gráfica de dona del gasto por categoría.
- Exportación del historial a CSV.
- Atajos de teclado en Movimientos (`N` para añadir, `Esc` para cerrar).

### [1.0.0] - 2026-06-16

Primera versión publicada: movimientos fijos y puntuales con categoría, comercio, etiquetas, cuenta y foto del recibo; gasto dividido; plantillas de alta rápida; deudas con cuota mensual; planes de ahorro; presupuestos y sobres; cuentas y patrimonio; resumen del mes, calendario, historial, comparativa y previsión de caja; exportación a XLSX y PDF; bloqueo con PIN; notificaciones; español e inglés.

---

## English

### [Sin publicar · Unreleased]

#### Changed

- CI and the release workflow use `pnpm/action-setup` 6.1.1 (was 6.1.0), pinned by SHA.

### [1.2.0] - 2026-11-19

Before updating, read the notices at the end of this version and [`docs/MIGRACION.md`](docs/MIGRACION.md).

#### Added

- Import bank statements in CSV or Excel (.xlsx) from Transactions. The wizard proposes the columns (date, description, amount or debit and credit), understands `1.234,56` and `1,234.56`, `dd/mm/yyyy` and `yyyy-mm-dd` dates, and CSV with `;`, `,` or tab, in UTF-8 or Windows-1252. It shows a preview with each row's errors and flags possible duplicates (what was already entered and rows repeated in the file) with a checkbox to include or exclude each one. The columns can be saved as the bank's profile, which is recognised on its own next time. The file is not stored: only the imported transactions remain.
- Category rules in Settings: "if the description contains X, the category is Y", with ordering, enable or disable, and income only or expenses only. The import applies them; anything that does not match goes to "Otros". When you change a transaction's category by hand, Bolsillo records it and, if it repeats, proposes the rule with a button to create it.
- Fixed items with a weekly, monthly, quarterly or yearly frequency, an optional first day and an end by date or by number of charges. A weekly item counts 4 or 5 times in the month, and a quarterly or yearly one only in its months. The form shows the date of the first charge, so you can see whether the first cycle is skipped (created on the 20th with payment on the 5th). Upcoming-payment reminders follow the frequency.
- Transfers between accounts and "Adjust balance" in Accounts. A transfer moves the balance of both accounts without counting as income or expense of the month. The adjustment leaves the account at the balance the bank shows on a date and records the difference separately. Both show up in a history with a delete option.
- Encrypted backup (`.bolsillo`) with its own password and the receipts inside, automatic backups on the computer (the last 10 and one per day for 30 days) that can be restored from Settings, recovery key, "Lock now" and auto-lock on inactivity.
- Rescue screen when the data cannot be read, instead of loading the sample on top, with a copy of the unreadable block.
- Persistent warning if saving fails, with automatic retry and confirmation when closing with unsaved changes.
- The welcome screen asks whether to start empty or with sample data. Settings has "Start from scratch" and "Load sample".
- `CHANGELOG.md` and a release workflow that builds the Windows installers into a draft release and attaches `SHA256SUMS`.

#### Changed

- Data is stored in an encrypted file written by Rust (`datos.bolsillo`, atomic writes), with AES-256-GCM and the key derived with Argon2id. Up to 1.1.0 it lived in the WebView `localStorage` with PBKDF2. Receipts go in separate files, so the roughly 5 MB cap is gone.
- Versioned data schema (now version 4) with step-by-step migrations and per-field validation when opening data and importing backups. Impossible dates from earlier versions are corrected and the original value is kept in a tag.
- Net worth counts transfers and balance adjustments.
- The Syne and DM Sans fonts ship inside the app: no requests to Google Fonts.
- jsPDF only loads when exporting and ExcelJS when exporting or importing an Excel file. The main bundle drops from about 1,612 kB to about 390 kB.
- Dialogs are keyboard accessible: `role="dialog"`, focus trap, `Esc` to close and names on icon buttons and fields.
- Export and import open native dialogs from Rust; the frontend no longer picks paths.

#### Security

- CSP defined in `tauri.conf.json` (it was `null` in 1.1.0).
- Single app instance, so two processes never write the same file at once.
- Weak PIN warning and credential minimums (4 to 6 digit PIN, password of 8 characters or more).

#### Fixed

- Forms reject invalid amounts or amounts above 999,999,999.99 with a message, instead of saving 0. The same applies to split-expense parts and plan contributions.
- Amounts are rounded in a single place (`utils/importe.ts`).

#### Notices

- The first time 1.2.0 reads the 1.1.0 data, it migrates it to the encrypted file. The 1.1.0 `localStorage` is not deleted and keeps its old protection. How to roll back: [`docs/MIGRACION.md`](docs/MIGRACION.md).
- 1.2.0 backups carry `version: 4`. 1.1.0 does not know that format.
- If you use 1.1.0 after migrating, what you record there does not move to 1.2.0 on its own: the app warns you and you have to import it by hand.
- The installer is still unsigned. Check the download against the release's `SHA256SUMS` file.

### [1.1.0] - 2026-06-16

#### Added

- Donut chart of spending by category.
- History export to CSV.
- Keyboard shortcuts in Transactions (`N` to add, `Esc` to close).

### [1.0.0] - 2026-06-16

First public release: fixed and one-off transactions with category, merchant, tags, account and receipt photo; split expenses; quick-entry templates; debts with a monthly instalment; savings plans; budgets and envelopes; accounts and net worth; monthly summary, calendar, history, comparison and cash forecast; export to XLSX and PDF; PIN lock; notifications; Spanish and English.

[Sin publicar · Unreleased]: https://github.com/zeroit789/bolsillo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/zeroit789/bolsillo/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zeroit789/bolsillo/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/zeroit789/bolsillo/releases/tag/v1.0.0
