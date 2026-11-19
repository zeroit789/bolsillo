# Migración a la 1.2.0 y vuelta atrás / Migrating to 1.2.0 and rolling back

- [Español](#español)
- [English](#english)

## Español

### Qué cambia

Hasta la 1.1.0, Bolsillo guardaba los datos en el `localStorage` del WebView (clave `bolsillo.datos.cif`, PBKDF2 a 150.000 iteraciones + AES-GCM). Desde la 1.2.0 los guarda en un **fichero cifrado** que escribe Rust, en el directorio de datos de la app. La primera vez que la 1.2.0 consigue leer los datos de la 1.1.0, los migra sola. **El `localStorage` original no se borra.**

### Qué ficheros hay

En Windows, el directorio de datos es `%APPDATA%\com.zeroit.bolsillo\` (con el perfil de desarrollo, `%APPDATA%\com.zeroit.bolsillo.dev\`):

| Fichero | Qué es |
|---|---|
| `datos.bolsillo` | Los datos, cifrados. JSON con una cabecera en claro (versión de formato, tipo de bloqueo, parámetros y sal de Argon2id, clave de datos envuelta) y el contenido cifrado con AES-256-GCM. |
| `almacen.marca` | Marca de que aquí ya hay un almacén. Si falta `datos.bolsillo` pero existe la marca (o hay copias o rescates), la app **no** vuelve a migrar ni enseña la bienvenida: muestra la pantalla de error. |
| `recibos\<id de clave>\<id>.rec` | Cada foto de recibo, cifrada en su propio fichero. No se borran nunca (las copias viejas los siguen necesitando). |
| `copias\reciente-*.bolsillo` | Las 10 últimas versiones, como mucho una cada 10 minutos. |
| `copias\diaria-AAAA-MM-DD.bolsillo` | Una por día (UTC), las 30 últimas. |
| `copias\antes-*.bolsillo` | El fichero que había justo antes de restaurar una copia. No rota. |
| `rescate\datos-*.bolsillo` | Ficheros que no se pudieron leer, apartados en vez de pisarlos. No se borran nunca. |
| `rescate\migracion-*.bolsillo` | Una migración que no pasó la verificación (para poder estudiarla). |

El `localStorage` de la 1.1.0 sigue en el perfil del WebView, `%LOCALAPPDATA%\com.zeroit.bolsillo\EBWebView\`.

### Cómo es la migración

1. Se leen los datos de `localStorage` como siempre (con tu PIN o contraseña si tenías bloqueo).
2. Rust escribe `datos.bolsillo.migrando` y lo verifica: lo vuelve a leer, deriva otra vez la clave desde tu credencial, lo descifra y compara los bytes; también comprueba los recibos y que la clave de recuperación abre.
3. La app lo relee por el camino normal (descifrar, migrar, validar) y lo compara en profundidad con los datos de origen, recibos incluidos.
4. Solo si todo coincide se renombra a `datos.bolsillo` y se escribe `almacen.marca`. La cabecera guarda la huella SHA-256 del bloque de `localStorage` migrado.

Si algo falla, `datos.bolsillo.migrando` se aparta a `rescate\migracion-*.bolsillo`, la app sigue usando `localStorage` como hasta ahora (con un aviso) y lo vuelve a intentar en el siguiente arranque.

Si tenías PIN o contraseña, se conserva el mismo (aunque no cumpla los mínimos nuevos) y se crea una **clave de recuperación**: apúntala, sirve para entrar si olvidas el PIN.

### Una vez migrado, manda el fichero

Si existe un `datos.bolsillo` válido, la 1.2.0 **nunca** vuelve a migrar desde `localStorage` encima. Si después de migrar alguien usa la 1.1.0 y apunta cosas, esas cosas van a `localStorage`, no al fichero. Al abrir otra vez la 1.2.0, la app detecta que el bloque de `localStorage` ya no es el que migró (su huella no coincide) y **avisa**, pero no lo importa sola: importarlo encima podría borrar lo que hiciste en la 1.2.0. Para traerlo, exporta una copia JSON desde la 1.1.0 e impórtala en la 1.2.0 sabiendo que sustituye los datos.

### Volver a la 1.1.0 sin perder nada

1. En la 1.2.0, **exporta una copia JSON** (Ajustes → Exportar copia). Es la forma de llevarte lo que hayas cambiado desde la migración.
2. Copia la carpeta `%APPDATA%\com.zeroit.bolsillo\` entera a otro sitio (otro disco o fuera del PC). ⚠️ Por confirmar si el desinstalador de la 1.2.0 la borra.
3. Instala la 1.1.0. Abrirá los datos de `localStorage` tal como estaban **en el momento de la migración**: lo que hiciste en la 1.2.0 no está ahí.
4. Para tenerlo, importa en la 1.1.0 la copia JSON del paso 1. ⚠️ Por confirmar con la 1.1.0 real: la copia de la 1.2.0 lleva `version: 3`, que la 1.1.0 no conoce.

La 1.1.0 no sabe leer `datos.bolsillo` y no lo toca. Si más tarde vuelves a la 1.2.0, esta abrirá `datos.bolsillo` (con lo que tenía al irte) y avisará de que `localStorage` cambió.

### Riesgos que siguen ahí

- **El bloque viejo de `localStorage` no se borra** y conserva su protección de la 1.1.0 (PBKDF2 a 150.000 iteraciones con tu PIN, o solo ofuscación sin PIN). Mientras exista, quien copie el perfil del WebView puede atacarlo como antes, aunque el fichero nuevo use Argon2id. Se conservará al menos hasta la versión siguiente.
- **Sin PIN ni contraseña, el fichero solo está ofuscado**: la clave que envuelve la clave de datos está en el código público.
- Las copias automáticas están **en el mismo disco**. Guarda también una copia cifrada fuera del PC.
- Si olvidas el PIN y pierdes la clave de recuperación, los datos no se pueden recuperar.

## English

### What changes

Up to 1.1.0, Bolsillo stored the data in the WebView `localStorage` (key `bolsillo.datos.cif`, PBKDF2 at 150,000 iterations + AES-GCM). Since 1.2.0 it stores it in an **encrypted file** written by Rust, in the app data directory. The first time 1.2.0 manages to read the 1.1.0 data, it migrates it by itself. **The original `localStorage` is not deleted.**

### Which files exist

On Windows, the data directory is `%APPDATA%\com.zeroit.bolsillo\` (with the development profile, `%APPDATA%\com.zeroit.bolsillo.dev\`):

| File | What it is |
|---|---|
| `datos.bolsillo` | The data, encrypted. JSON with a plaintext header (format version, lock type, Argon2id parameters and salt, wrapped data key) and the content encrypted with AES-256-GCM. |
| `almacen.marca` | Marker that a store already lives here. If `datos.bolsillo` is missing but the marker exists (or there are backups or rescues), the app does **not** migrate again nor show the welcome: it shows the error screen. |
| `recibos\<key id>\<id>.rec` | Each receipt photo, encrypted in its own file. They are never deleted (old backups still need them). |
| `copias\reciente-*.bolsillo` | The last 10 versions, at most one every 10 minutes. |
| `copias\diaria-YYYY-MM-DD.bolsillo` | One per day (UTC), the last 30. |
| `copias\antes-*.bolsillo` | The file that existed right before restoring a backup. It does not rotate. |
| `rescate\datos-*.bolsillo` | Files that could not be read, moved aside instead of being overwritten. Never deleted. |
| `rescate\migracion-*.bolsillo` | A migration that failed verification (kept so it can be studied). |

The 1.1.0 `localStorage` stays in the WebView profile, `%LOCALAPPDATA%\com.zeroit.bolsillo\EBWebView\`.

### How the migration works

1. The data is read from `localStorage` as always (with your PIN or password if you had a lock).
2. Rust writes `datos.bolsillo.migrando` and verifies it: reads it back, derives the key again from your credential, decrypts it and compares the bytes; it also checks the receipts and that the recovery key opens it.
3. The app reads it back through the normal path (decrypt, migrate, validate) and deep-compares it with the source data, receipts included.
4. Only if everything matches is it renamed to `datos.bolsillo` and `almacen.marca` written. The header keeps the SHA-256 fingerprint of the migrated `localStorage` block.

If anything fails, `datos.bolsillo.migrando` is moved to `rescate\migracion-*.bolsillo`, the app keeps using `localStorage` as before (with a warning) and tries again on the next start.

If you had a PIN or password, the same one is kept (even if it does not meet the new minimums) and a **recovery key** is created: write it down, it lets you in if you forget the PIN.

### Once migrated, the file rules

If a valid `datos.bolsillo` exists, 1.2.0 **never** migrates from `localStorage` on top of it again. If, after migrating, someone uses 1.1.0 and records things, they go to `localStorage`, not to the file. When 1.2.0 opens again, it detects that the `localStorage` block is no longer the one it migrated (its fingerprint does not match) and **warns**, but it does not import it by itself: importing it on top could wipe what you did in 1.2.0. To bring it over, export a JSON backup from 1.1.0 and import it into 1.2.0, knowing that it replaces the data.

### Going back to 1.1.0 without losing anything

1. In 1.2.0, **export a JSON backup** (Settings → Export backup). That is how you take along whatever changed since the migration.
2. Copy the whole `%APPDATA%\com.zeroit.bolsillo\` folder somewhere else (another disk or off the PC). ⚠️ To be confirmed whether the 1.2.0 uninstaller deletes it.
3. Install 1.1.0. It will open the `localStorage` data as it was **at the moment of the migration**: what you did in 1.2.0 is not there.
4. To get it, import into 1.1.0 the JSON backup from step 1. ⚠️ To be confirmed with the real 1.1.0: the 1.2.0 backup carries `version: 3`, which 1.1.0 does not know.

1.1.0 cannot read `datos.bolsillo` and does not touch it. If you later go back to 1.2.0, it will open `datos.bolsillo` (with what it had when you left) and warn that `localStorage` changed.

### Remaining risks

- **The old `localStorage` block is not deleted** and keeps its 1.1.0 protection (PBKDF2 at 150,000 iterations with your PIN, or only obfuscation without a PIN). While it exists, whoever copies the WebView profile can attack it as before, even though the new file uses Argon2id. It will be kept at least until the next version.
- **Without a PIN or password, the file is only obfuscated**: the key that wraps the data key lives in the public code.
- Automatic backups are **on the same disk**. Also keep an encrypted backup off the PC.
- If you forget the PIN and lose the recovery key, the data cannot be recovered.
