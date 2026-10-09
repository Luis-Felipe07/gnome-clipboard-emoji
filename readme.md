# 📋😀 Gnome Clipboard & Emoji Switcher (`Super + V`)

> Un historial de portapapeles y selector de emojis nativo para GNOME Shell y Ubuntu (Wayland / X11), diseñado para replicar la experiencia de `Win + V` de Windows en Linux.

![GNOME Shell Version](https://img.shields.io/badge/GNOME%20Shell-45%20%7C%2046%20%7C%2047%20%7C%2048%20%7C%2049%20%7C%2050-blue?style=for-the-badge&logo=gnome)
![Wayland Supported](https://img.shields.io/badge/Wayland-Supported-brightgreen?style=for-the-badge&logo=ubuntu)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

---

## 🚀 Características

- **📋 Historial de Portapapeles:** Registra automáticamente los elementos copiados mediante `Ctrl + C`, incluyendo texto UTF-8 y buffers de imagen.
- **😀 Selector de Emojis:** Explora y busca emojis rápidamente, organizados por categorías y nombres en español desde el archivo local `emojis.json`.
- **⌨️ Atajo Global (`Super + V`):** Abre la interfaz de la extensión desde cualquier aplicación.
- **⚡ Inyección Automática:** Al seleccionar un elemento del historial, este se copia al búfer activo y se realiza automáticamente el pegado (`Ctrl + V`) en la ventana enfocada.
- **🎨 UI Nativa:** Construida utilizando las librerías `St` y `Clutter` de GNOME Shell para integrarse con el entorno de escritorio.
- **🧩 Arquitectura ESM:** Diseñada utilizando **ES Modules**, siguiendo la arquitectura moderna de las extensiones de GNOME Shell 45+.
- **🌐 Wayland / X11:** Diseñada para funcionar tanto en sesiones Wayland como X11.

---

## 🛠️ Requisitos del Sistema

- **Sistema Operativo:** Ubuntu 23.10+, Fedora 39+ o cualquier distribución compatible con GNOME Shell 45+.
- **GNOME Shell:** Versiones 45, 46, 47, 48, 49 o 50+.
- **Sesión gráfica:** Wayland o X11.
- **Dependencias:**
  - `git`
  - `gnome-extensions`

Puedes comprobar la versión instalada de GNOME Shell con:

```bash
gnome-shell --version
```

También puedes comprobar que la herramienta de extensiones está disponible:

```bash
gnome-extensions --version
```

---

## 📦 Instalación

### 1. Clonar el repositorio

Clona el proyecto dentro de tu directorio personal:

```bash
git clone https://github.com/Luis-Felipe07/gnome-clipboard-emoji.git
```

Entra en el directorio del proyecto:

```bash
cd gnome-clipboard-emoji
```

---

### 2. Crear un enlace simbólico

GNOME Shell busca las extensiones de usuario dentro de:

```text
~/.local/share/gnome-shell/extensions/
```

Crea el directorio si no existe:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions
```

Después, crea un enlace simbólico del proyecto:

```bash
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/clipboard-emoji@caspian.dev
```

Puedes comprobar que el enlace se creó correctamente con:

```bash
ls -la ~/.local/share/gnome-shell/extensions/
```

---

### 3. Liberar el atajo `Super + V`

Por defecto, GNOME puede utilizar `Super + V` para abrir la bandeja de notificaciones/calendario.

Para liberar este atajo, ejecuta:

```bash
gsettings set org.gnome.shell.keybindings toggle-message-tray "[]"
```

Puedes comprobar la configuración actual con:

```bash
gsettings get org.gnome.shell.keybindings toggle-message-tray
```

Debería devolver:

```text
@as []
```

---

### 4. Reiniciar la sesión de GNOME

Para que GNOME Shell detecte correctamente la nueva extensión, reinicia tu sesión.

#### Wayland

En Wayland, la opción recomendada es cerrar sesión y volver a iniciar sesión.

También puedes utilizar:

```text
Ctrl + Alt + Supr
```

y seleccionar **Cerrar sesión**.

#### X11

En una sesión X11 puedes reiniciar GNOME Shell con:

```text
Alt + F2
```

Escribe:

```text
r
```

y presiona `Enter`.

> **Nota:** El método `Alt + F2 → r` no está disponible en Wayland.

---

### 5. Habilitar la extensión

Después de iniciar nuevamente la sesión, ejecuta:

```bash
gnome-extensions enable clipboard-emoji@caspian.dev
```

Puedes comprobar el estado de la extensión con:

```bash
gnome-extensions info clipboard-emoji@caspian.dev
```

Si todo está correctamente configurado, GNOME debería mostrar la extensión como habilitada.

---

## ⌨️ Uso

Una vez instalada y habilitada la extensión:

### Abrir el historial

Presiona:

```text
Super + V
```

Se abrirá la interfaz de **Gnome Clipboard & Emoji Switcher**.

Desde allí podrás acceder al historial del portapapeles y al selector de emojis.

### Seleccionar un elemento

Al seleccionar un elemento del historial:

1. El contenido se coloca nuevamente en el portapapeles.
2. La ventana que tenía el foco vuelve a recibir la atención.
3. La extensión ejecuta el pegado automáticamente.
4. El contenido aparece en la aplicación activa.

---

## 😀 Selector de Emojis

El selector de emojis utiliza el archivo:

```text
emojis.json
```

Este archivo contiene la información necesaria para organizar y buscar emojis.

Los emojis pueden clasificarse mediante:

- Categorías.
- Nombres.
- Palabras clave en español.

Esto permite realizar búsquedas como:

```text
corazón
fuego
sonrisa
perro
gato
cohete
```

La base de datos se mantiene localmente, evitando depender de un servicio externo para realizar las búsquedas.

---

## 🖥️ Estructura del Proyecto

```text
clipboard-emoji@caspian.dev/
├── metadata.json       # Metadatos, UUID y compatibilidad con GNOME Shell
├── extension.js        # Punto de entrada principal de la extensión
├── stylesheet.css      # Estilos de la interfaz St / Clutter
├── emojis.json         # Base de datos local de emojis
└── README.md           # Documentación del proyecto
```

---

## 🧩 Arquitectura

La extensión utiliza la arquitectura moderna de extensiones de GNOME Shell basada en **ES Modules (ESM)**.

El punto de entrada principal es:

```text
extension.js
```

La extensión implementa el ciclo de vida estándar:

```text
enable()
   │
   ├── Registrar atajos
   ├── Inicializar historial
   ├── Crear interfaz
   └── Registrar eventos
        │
        ▼
      GNOME Shell
        │
        ▼
disable()
   │
   ├── Eliminar atajos
   ├── Desconectar eventos
   ├── Destruir interfaz
   └── Liberar recursos
```

Esto permite activar y desactivar la extensión sin necesidad de reiniciar completamente GNOME Shell.

---

## 🔍 Depuración y Logs

Si necesitas comprobar el estado de la extensión:

```bash
gnome-extensions info clipboard-emoji@caspian.dev
```

Para comprobar si la extensión está habilitada:

```bash
gnome-extensions list --enabled
```

Puedes buscar la extensión específicamente con:

```bash
gnome-extensions list --enabled | grep clipboard-emoji
```

### Ver logs de GNOME Shell

Para observar los registros en tiempo real:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Si quieres filtrar los mensajes relacionados con el portapapeles:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i "clipboard"
```

También puedes buscar errores relacionados con la extensión:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i "clipboard-emoji"
```

---

## 🔄 Deshabilitar la extensión

Para deshabilitar temporalmente la extensión:

```bash
gnome-extensions disable clipboard-emoji@caspian.dev
```

Para volver a habilitarla:

```bash
gnome-extensions enable clipboard-emoji@caspian.dev
```

---

## 🗑️ Desinstalación

Primero deshabilita la extensión:

```bash
gnome-extensions disable clipboard-emoji@caspian.dev
```

Después elimina el enlace simbólico:

```bash
rm ~/.local/share/gnome-shell/extensions/clipboard-emoji@caspian.dev
```

Finalmente, puedes restaurar el comportamiento original de `Super + V`:

```bash
gsettings reset org.gnome.shell.keybindings toggle-message-tray
```

> Si utilizaste una instalación mediante enlace simbólico, eliminar el enlace no elimina el repositorio original.

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas.

Si deseas agregar nuevas funcionalidades, categorías de emojis, optimizar el historial del portapapeles o mejorar la interfaz:

1. Haz un **Fork** del repositorio.
2. Crea una nueva rama:

```bash
git checkout -b feature/nueva-caracteristica
```

3. Realiza tus cambios.
4. Guarda los cambios:

```bash
git add .
```

5. Crea un commit:

```bash
git commit -m "feat: agregar nueva caracteristica"
```

6. Sube la rama:

```bash
git push origin feature/nueva-caracteristica
```

7. Abre un **Pull Request**.

---

## 🐛 Reportar errores

Si encuentras un problema, proporciona la siguiente información:

- Distribución Linux.
- Versión de GNOME Shell.
- Tipo de sesión: Wayland o X11.
- Versión de la extensión.
- Pasos necesarios para reproducir el problema.
- Mensajes relevantes obtenidos mediante `journalctl`.

Ejemplo:

```text
OS: Ubuntu 24.04
GNOME Shell: 46
Sesión: Wayland

Problema:
Super + V no abre la interfaz.

Logs:
[pegar aquí los logs relevantes]
```

---

## 🔮 Próximas mejoras

Algunas funcionalidades que podrían incorporarse en futuras versiones:

- [ ] Persistencia del historial entre sesiones.
- [ ] Configuración del número máximo de elementos almacenados.
- [ ] Eliminación individual de elementos del historial.
- [ ] Botón para limpiar todo el historial.
- [ ] Favoritos para emojis y elementos del portapapeles.
- [ ] Más categorías y palabras clave para emojis.
- [ ] Soporte para configuraciones adicionales del atajo global.
- [ ] Página de preferencias de GNOME.
- [ ] Mejoras de rendimiento para grandes historiales.
- [ ] Soporte ampliado para diferentes tipos de contenido del portapapeles.

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia **MIT**.

Consulta el archivo [`LICENSE`](LICENSE) para obtener el texto completo de la licencia.

---

## 👨‍💻 Autor

**Luis Felipe Barrios**

GitHub:

https://github.com/Luis-Felipe07

---

## ⭐ ¿Te resulta útil?

Si este proyecto te resulta útil, considera darle una estrella al repositorio en GitHub.

También puedes contribuir mediante issues, pull requests o nuevas funcionalidades.

---

<p align="center">
  Hecho  para GNOME y Linux
</p>