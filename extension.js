import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ClipboardEmojiExtension extends Extension {

    enable() {
        this._history = [];
        this._maxHistory = 20;
        this._accelAction = Meta.KeyBindingAction.NONE;
        this._isInternalCopy = false;
        this._internalCopyTimeoutId = 0;

        // Ventana que tenía el foco antes de abrir el historial.
        this._targetWindow = null;
        this._pasteDelayId = 0;
        this._injectDelayId = 0;
        this._reopenDelayId = 0;
        this._virtualKeyboard = null;

        this._positionInitialized = false;
        this._dragState = null;
        this._dragMotionSignal = 0;
        this._dragReleaseSignal = 0;

        this._cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'clipboard-emoji']);
        GLib.mkdir_with_parents(this._cacheDir, 0o755);

        this._setupClipboardListener();
        this._setupKeyboardShortcut();
        this._loadEmojiData();
        this._buildUI();
    }

    _loadEmojiData() {
        try {
            let file = this.dir.get_child('emojis.json');
            if (file.query_exists(null)) {
                let [ok, contents] = file.load_contents(null);
                if (ok && contents) {
                    let decoder = new TextDecoder('utf-8');
                    this._emojis = JSON.parse(decoder.decode(contents));
                    return;
                }
            }
        } catch (e) {
            console.error('[Clipboard] Error al cargar emojis.json:', e);
        }
        this._emojis = this._getDefaultEmojis();
    }

    _setupClipboardListener() {
        try {
            const selection = global.display.get_selection();
            this._selectionSignal = selection.connect('owner-changed', (sel, selectionType) => {
                if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {

                    const mimetypes = selection.get_mimetypes(
                        Meta.SelectionType.SELECTION_CLIPBOARD
                    ) || [];

                    console.log(`[Clipboard] MIME types detectados: ${JSON.stringify(mimetypes)}`);

                    // GNOME puede emitir una notificación transitoria sin MIME types.
                    // No la tratamos como una copia real ni consumimos la marca interna.
                    if (mimetypes.length === 0)
                        return;

                    if (this._isInternalCopy) {
                        this._isInternalCopy = false;
                        if (this._internalCopyTimeoutId) {
                            GLib.source_remove(this._internalCopyTimeoutId);
                            this._internalCopyTimeoutId = 0;
                        }
                        console.log('[Clipboard] Cambio interno del portapapeles ignorado.');
                        return;
                    }

                    this._fetchClipboardContent(sel);
                }
            });
        } catch (e) {
            console.error('[Clipboard] Error conectando evento portapapeles:', e);
        }
    }

    _fetchClipboardContent(selection) {
        const mimetypes = selection.get_mimetypes(
            Meta.SelectionType.SELECTION_CLIPBOARD
        ) || [];

        // Preferimos PNG, pero admitimos otros MIME types image/* anunciados.
        const imageMime = mimetypes.find((mime) => mime === 'image/png')
            || mimetypes.find((mime) => mime.startsWith('image/'));

        if (imageMime) {
            this._fetchImageContent(selection, imageMime);
        } else {
            this._fetchTextContent();
        }
    }

    _fetchImageContent(selection, mimeType = 'image/png') {
        const extensionByMime = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'image/bmp': 'bmp',
        };
        const fileExtension = extensionByMime[mimeType] || 'img';
        const filePath = GLib.build_filenamev([
            this._cacheDir,
            `img_${Date.now()}.${fileExtension}`,
        ]);
        const file = Gio.File.new_for_path(filePath);
        let outputStream = null;

        console.log(`[Clipboard] Solicitando transferencia de ${mimeType}.`);

        try {
            // Meta.Selection.transfer_async escribe en el GOutputStream recibido.
            // El tamaño -1 significa que no imponemos un límite de bytes.
            outputStream = file.replace(
                null,
                false,
                Gio.FileCreateFlags.NONE,
                null
            );

            selection.transfer_async(
                Meta.SelectionType.SELECTION_CLIPBOARD,
                mimeType,
                -1,
                outputStream,
                null,
                (sel, res) => {
                    let transferSucceeded = false;

                    try {
                        // transfer_finish devuelve un booleano; no devuelve un flujo.
                        transferSucceeded = sel.transfer_finish(res);
                    } catch (e) {
                        console.error('[Clipboard] Error al finalizar la transferencia:', e);
                    }

                    try {
                        outputStream.close(null);
                    } catch (e) {
                        console.error('[Clipboard] Error al cerrar el archivo de imagen:', e);
                    }

                    if (!transferSucceeded) {
                        console.error(`[Clipboard] La transferencia de ${mimeType} no finalizó correctamente.`);
                        try {
                            file.delete(null);
                        } catch (_) {
                            // El archivo temporal puede no existir si la transferencia falló al empezar.
                        }
                        return;
                    }

                    try {
                        const info = file.query_info(
                            'standard::size',
                            Gio.FileQueryInfoFlags.NONE,
                            null
                        );
                        const bytesWritten = info.get_size();

                        if (bytesWritten <= 0) {
                            console.error(`[Clipboard] La transferencia de ${mimeType} produjo un archivo vacío.`);
                            file.delete(null);
                            return;
                        }

                        console.log(
                            `[Clipboard] Imagen guardada: ${filePath} (${bytesWritten} bytes).`
                        );
                        this._addHistoryItem({
                            type: 'image',
                            path: filePath,
                            mimeType,
                        });
                    } catch (e) {
                        console.error('[Clipboard] Error al verificar/guardar la imagen:', e);
                    }
                }
            );
        } catch (e) {
            if (outputStream) {
                try {
                    outputStream.close(null);
                } catch (_) {
                    // Conservamos el error original para el registro.
                }
            }
            console.error('[Clipboard] No se pudo iniciar la transferencia de imagen:', e);
            try {
                file.delete(null);
            } catch (_) {
                // El archivo temporal puede no haberse creado.
            }
        }
    }

    _fetchTextContent() {
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (text && text.trim().length > 0) {
                this._addHistoryItem({ type: 'text', content: text });
            }
        });
    }

    _addHistoryItem(newItem) {
        if (this._history.length > 0) {
            let last = this._history[0];
            if (newItem.type === 'text' && last.type === 'text' && last.content === newItem.content) return;
            if (newItem.type === 'image' && last.type === 'image' && last.path === newItem.path) return;
        }

        this._history.unshift(newItem);

        if (this._history.length > this._maxHistory) {
            let removed = this._history.pop();
            if (removed.type === 'image') {
                let file = Gio.File.new_for_path(removed.path);
                file.delete_async(GLib.PRIORITY_DEFAULT, null, null);
            }
        }

        this._refreshClipboardUI();
    }


    _setupKeyboardShortcut() {
        try {
            this._accelAction = global.display.grab_accelerator(
                '<Super>v',
                0
            );

            if (this._accelAction !== Meta.KeyBindingAction.NONE) {
                // Obtener el nombre del acelerador registrado.
                this._accelBindingName =
                    Meta.external_binding_name_for_action(this._accelAction);

                if (this._accelBindingName) {
                    // Permitir que GNOME Shell ejecute el atajo.
                    Main.wm.allowKeybinding(
                        this._accelBindingName,
                        Shell.ActionMode.ALL
                    );

                    console.log(
                        '[Clipboard] Atajo Super+V registrado y habilitado.'
                    );
                } else {
                    console.error(
                        '[Clipboard] No se pudo obtener el nombre del acelerador.'
                    );
                }

                this._accelSignal = global.display.connect(
                    'accelerator-activated',
                    (display, action, deviceId, timestamp) => {
                        console.log(
                            `[Clipboard] Señal recibida: action=${action}, ` +
                            `esperado=${this._accelAction}`
                        );

                        if (action === this._accelAction) {
                            console.log(
                                '[Clipboard] Atajo Super+V pulsado.'
                            );

                            this._togglePopup();
                        }
                    }
                );
            } else {
                console.error(
                    '[Clipboard] Super+V no pudo capturarse en Mutter.'
                );
            }
        } catch (e) {
            console.error(
                '[Clipboard] Error al capturar atajo de teclado:',
                e
            );
        }
    }


    _getDefaultEmojis() {
        return [
            { char: '😀', name: 'sonrisa' },
            { char: '😂', name: 'risas' },
            { char: '🔥', name: 'fuego' },
            { char: '👍', name: 'pulgar arriba' },
            { char: '🚀', name: 'cohete' },
            { char: '❤️', name: 'corazon' }
        ];
    }

    _buildUI() {
        this._popup = new St.BoxLayout({
            style_class: 'clipboard-popup',
            vertical: true,
            visible: false,
            reactive: true
        });

        // Barra superior arrastrable: permite mover el popup entre monitores.
        const headerBox = new St.BoxLayout({
            vertical: true,
            style_class: 'popup-header',
            x_expand: true
        });
        const titleRow = new St.BoxLayout({
            vertical: false,
            style_class: 'popup-title-row',
            x_expand: true
        });
        const dragHandle = new St.Label({
            text: '⠿  Clipboard & Emoji Switcher',
            style_class: 'drag-handle',
            x_expand: true,
            reactive: true,
            can_focus: false
        });
        const closeButton = new St.Button({
            label: '×',
            style_class: 'close-button',
            can_focus: true,
            accessible_name: 'Cerrar portapapeles'
        });
        const tabBox = new St.BoxLayout({
            vertical: false,
            style_class: 'tab-box'
        });

        const btnClipboardTab = new St.Button({
            label: ' Portapapeles',
            style_class: 'tab-button'
        });
        const btnEmojiTab = new St.Button({
            label: ' Emojis',
            style_class: 'tab-button'
        });

        btnClipboardTab.connect('clicked', () => this._switchTab('clipboard'));
        btnEmojiTab.connect('clicked', () => this._switchTab('emoji'));
        closeButton.connect('clicked', () => this._closePopup());

        titleRow.add_child(dragHandle);
        titleRow.add_child(closeButton);
        tabBox.add_child(btnClipboardTab);
        tabBox.add_child(btnEmojiTab);
        headerBox.add_child(titleRow);
        headerBox.add_child(tabBox);
        this._popup.add_child(headerBox);
        this._setupPopupDragging(dragHandle);

        this._contentStack = new St.BoxLayout({
            vertical: true,
            style_class: 'content-area',
            x_expand: true,
            y_expand: true
        });
        this._popup.add_child(this._contentStack);

        Main.uiGroup.add_child(this._popup);
        this._switchTab('clipboard');
    }

    _closePopup() {
        if (this._popup)
            this._popup.hide();
        console.log('[Clipboard] Popup cerrado por el usuario.');
    }

    _switchTab(tabName) {
        this._contentStack.destroy_all_children();

        if (tabName === 'clipboard') {
            this._renderClipboardTab();
        } else {
            this._renderEmojiTab();
        }
    }

    _renderClipboardTab() {
        let scrollView = new St.ScrollView({ style_class: 'scroll-container', x_expand: true });
        let listContainer = new St.BoxLayout({ vertical: true, style_class: 'item-list', x_expand: true });

        if (this._history.length === 0) {
            let emptyLabel = new St.Label({ text: 'El historial está vacío', style_class: 'empty-label' });
            listContainer.add_child(emptyLabel);
        } else {
            this._history.forEach((item) => {
                let itemBtn;

                if (item.type === 'text') {
                    // Vista previa limitada para que cada entrada ocupe unas 2-3 líneas.
                    let preview = item.content.replace(/\s+/g, ' ').trim();
                    if (preview.length > 110)
                        preview = preview.substring(0, 107) + '…';

                    let textLabel = new St.Label({
                        text: preview,
                        style_class: 'history-item-label',
                        x_expand: true,
                        y_expand: true
                    });
                    textLabel.clutter_text.set_line_wrap(true);

                    itemBtn = new St.Button({
                        child: textLabel,
                        style_class: 'history-item',
                        x_expand: true,
                        can_focus: true
                    });

                    itemBtn.connect('clicked', () => {
                        this._selectTextAndPaste(item.content);
                    });
                } else if (item.type === 'image') {
                    // Cargar la imagen real como miniatura, no como icono genérico de archivo.
                    const themeContext = St.ThemeContext.get_for_stage(global.stage);
                    const scaleFactor = themeContext.scale_factor || 1;

                    // load_file_async devuelve un Clutter.Actor, no un St.Widget.
                    // Por ello, aplicamos la clase CSS a un St.Bin que lo contiene.
                    const imageTexture = St.TextureCache.get_default().load_file_async(
                        Gio.File.new_for_path(item.path),
                        300,
                        135,
                        scaleFactor,
                        1
                    );

                    const imageContainer = new St.Bin({
                        style_class: 'image-preview',
                        child: imageTexture,
                        x_expand: true
                    });

                    itemBtn = new St.Button({
                        child: imageContainer,
                        style_class: 'history-item history-item-img',
                        x_expand: true,
                        can_focus: true
                    });
                    console.log(`[Clipboard] Miniatura agregada al historial: ${item.path}`);

                    itemBtn.connect('clicked', () => {
                        if (this._copyImageToClipboard(item.path, item.mimeType || 'image/png'))
                            this._pasteKeepingPopupOpen();
                    });
                }

                listContainer.add_child(itemBtn);
            });
        }

        scrollView.add_child(listContainer);
        this._contentStack.add_child(scrollView);
    }

    _markInternalCopy() {
        this._isInternalCopy = true;

        if (this._internalCopyTimeoutId)
            GLib.source_remove(this._internalCopyTimeoutId);

        // Evita que la marca quede activa si GNOME no emite un MIME type utilizable.
        this._internalCopyTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            1500,
            () => {
                this._isInternalCopy = false;
                this._internalCopyTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _selectTextAndPaste(text) {
        try {
            if (typeof text !== 'string' || text.length === 0) {
                console.error('[Clipboard] El elemento seleccionado no contiene texto válido.');
                return;
            }

            const codePoints = Array.from(text)
                .map(char => `U+${char.codePointAt(0).toString(16).toUpperCase()}`)
                .join(' ');
            console.log(
                `[Clipboard] Texto seleccionado para pegar: ${JSON.stringify(text)}; ` +
                `puntos Unicode: ${codePoints}`
            );

            this._markInternalCopy();
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
            this._pasteKeepingPopupOpen();
        } catch (e) {
            console.error('[Clipboard] Error al copiar texto seleccionado:', e);
        }
    }

    // Para que Wayland entregue el atajo a la aplicación de destino, el popup
    // se oculta brevemente durante el cambio de foco y reaparece automáticamente.
    _pasteKeepingPopupOpen() {
        const wasVisible = Boolean(this._popup && this._popup.visible);
        this._shouldReopenAfterPaste = wasVisible;

        if (this._popup && wasVisible) {
            this._popup.hide();
            console.log('[Clipboard] Popup oculto brevemente para entregar el foco a la aplicación.');
        }

        this._schedulePaste(this._targetWindow);
    }

    _schedulePaste(targetWindow) {
        if (this._pasteDelayId)
            GLib.source_remove(this._pasteDelayId);
        if (this._injectDelayId)
            GLib.source_remove(this._injectDelayId);
        if (this._reopenDelayId) {
            GLib.source_remove(this._reopenDelayId);
            this._reopenDelayId = 0;
        }

        // El tiempo permite que Mutter quite el actor superior y reactive
        // la ventana que tenía el foco antes de abrir el historial.
        this._pasteDelayId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            100,
            () => {
                this._pasteDelayId = 0;

                try {
                    global.stage.set_key_focus(null);

                    if (targetWindow) {
                        Main.activateWindow(targetWindow);
                        console.log('[Clipboard] Ventana destino reactivada.');
                    } else {
                        console.warn('[Clipboard] No hay ventana destino registrada para pegar.');
                    }
                } catch (e) {
                    console.error('[Clipboard] No se pudo restaurar el foco:', e);
                }

                this._injectDelayId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    120,
                    () => {
                        this._injectDelayId = 0;
                        this._injectPaste();

                        // Reaparecer después de inyectar Ctrl+V. Conserva la pestaña
                        // y la posición anterior, y no vuelve a capturar el foco.
                        if (this._shouldReopenAfterPaste && this._popup) {
                            this._reopenDelayId = GLib.timeout_add(
                                GLib.PRIORITY_DEFAULT,
                                100,
                                () => {
                                    this._reopenDelayId = 0;
                                    if (this._popup) {
                                        this._popup.show();
                                        console.log('[Clipboard] Popup restaurado después del pegado.');
                                    }
                                    this._shouldReopenAfterPaste = false;
                                    return GLib.SOURCE_REMOVE;
                                }
                            );
                        }

                        return GLib.SOURCE_REMOVE;
                    }
                );

                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _injectPaste() {
        try {
            if (!this._virtualKeyboard) {
                const seat = Clutter.get_default_backend().get_default_seat();
                this._virtualKeyboard = seat.create_virtual_device(
                    Clutter.InputDeviceType.KEYBOARD_DEVICE
                );
            }

            if (!this._virtualKeyboard) {
                console.error('[Clipboard] Mutter no pudo crear un teclado virtual.');
                return;
            }

            // Algunos terminales requieren Ctrl+Shift+V, no Ctrl+V.
            let targetClass = '';
            try {
                targetClass = (this._targetWindow?.get_wm_class() || '').toLowerCase();
            } catch (_) {
                // Algunas ventanas no exponen WM_CLASS; usamos Ctrl+V por defecto.
            }
            const isTerminal = /terminal|ptyxis|kgx|konsole|alacritty|kitty|wezterm|xterm|tilix|foot/.test(targetClass);
            const device = this._virtualKeyboard;
            let timestamp = GLib.get_monotonic_time();
            const step = 10;
            const ctrl = 29;  // Linux evdev KEY_LEFTCTRL
            const shift = 42; // Linux evdev KEY_LEFTSHIFT
            const v = 47;     // Linux evdev KEY_V

            device.notify_key(timestamp, ctrl, Clutter.KeyState.PRESSED);
            timestamp += step;
            if (isTerminal) {
                device.notify_key(timestamp, shift, Clutter.KeyState.PRESSED);
                timestamp += step;
            }
            device.notify_key(timestamp, v, Clutter.KeyState.PRESSED);
            timestamp += step;
            device.notify_key(timestamp, v, Clutter.KeyState.RELEASED);
            timestamp += step;
            if (isTerminal) {
                device.notify_key(timestamp, shift, Clutter.KeyState.RELEASED);
                timestamp += step;
            }
            device.notify_key(timestamp, ctrl, Clutter.KeyState.RELEASED);

            console.log(`[Clipboard] Atajo ${isTerminal ? 'Ctrl+Shift+V' : 'Ctrl+V'} enviado a la ventana destino.`);
        } catch (e) {
            console.error('[Clipboard] Error al simular el atajo de pegado:', e);
        }
    }

    _copyImageToClipboard(filePath, mimeType = 'image/png') {
        try {
            const file = Gio.File.new_for_path(filePath);
            // load_bytes() devuelve [GLib.Bytes, etag]; St.Clipboard.set_content
            // acepta directamente GLib.Bytes y publica el MIME type para otras apps.
            const [bytes] = file.load_bytes(null);

            if (!bytes || bytes.get_size() <= 0) {
                console.error('[Clipboard] El archivo de imagen no devolvió bytes válidos.');
                return false;
            }

            this._markInternalCopy();
            St.Clipboard.get_default().set_content(
                St.ClipboardType.CLIPBOARD,
                mimeType,
                bytes
            );

            console.log(
                `[Clipboard] Imagen publicada en el portapapeles como ${mimeType} ` +
                `(${bytes.get_size()} bytes).`
            );
            return true;
        } catch (e) {
            console.error('[Clipboard] Error al publicar imagen en el portapapeles:', e);
            return false;
        }
    }

    _renderEmojiTab() {
        let scrollView = new St.ScrollView({ style_class: 'scroll-container' });
        let gridContainer = new St.BoxLayout({ vertical: true, style_class: 'emoji-grid-container' });

        if (this._emojis && Array.isArray(this._emojis)) {
            let currentRow = null;
            let itemsPerRow = 8;

            this._emojis.forEach((item, index) => {
                if (index % itemsPerRow === 0) {
                    currentRow = new St.BoxLayout({ vertical: false, style_class: 'emoji-row' });
                    gridContainer.add_child(currentRow);
                }

                let emojiBtn = new St.Button({
                    label: item.char,
                    style_class: 'emoji-button'
                });

                emojiBtn.connect('clicked', () => {
                    console.log(`[Clipboard] Botón de emoji pulsado: ${JSON.stringify(item.char)}`);
                    this._selectTextAndPaste(item.char);
                });

                if (currentRow) {
                    currentRow.add_child(emojiBtn);
                }
            });
        }

        scrollView.add_child(gridContainer);
        this._contentStack.add_child(scrollView);
    }

    _refreshClipboardUI() {
        if (this._popup && this._popup.visible) {
            this._switchTab('clipboard');
        }
    }

    _setupPopupDragging(dragHandle) {
        dragHandle.connect('button-press-event', (actor, event) => {
            if (event.get_button() !== 1)
                return Clutter.EVENT_PROPAGATE;

            const [pointerX, pointerY] = event.get_coords();
            const [popupX, popupY] = this._popup.get_position();
            this._dragState = { pointerX, pointerY, popupX, popupY };

            // Seguir el puntero en el stage permite cruzar el borde del monitor
            // actual sin perder el arrastre.
            if (this._dragMotionSignal)
                global.stage.disconnect(this._dragMotionSignal);
            if (this._dragReleaseSignal)
                global.stage.disconnect(this._dragReleaseSignal);

            this._dragMotionSignal = global.stage.connect('motion-event', (stage, motionEvent) => {
                if (!this._dragState || !this._popup)
                    return Clutter.EVENT_PROPAGATE;

                const [x, y] = motionEvent.get_coords();
                const [width, height] = this._popup.get_size();
                const monitors = Main.layoutManager.monitors || [];
                if (monitors.length > 0) {
                    const minX = Math.min(...monitors.map(m => m.x));
                    const minY = Math.min(...monitors.map(m => m.y));
                    const maxX = Math.max(...monitors.map(m => m.x + m.width));
                    const maxY = Math.max(...monitors.map(m => m.y + m.height));
                    const nextX = Math.max(minX, Math.min(
                        this._dragState.popupX + x - this._dragState.pointerX,
                        maxX - width
                    ));
                    const nextY = Math.max(minY, Math.min(
                        this._dragState.popupY + y - this._dragState.pointerY,
                        maxY - height
                    ));
                    this._popup.set_position(Math.round(nextX), Math.round(nextY));
                } else {
                    this._popup.set_position(
                        Math.round(this._dragState.popupX + x - this._dragState.pointerX),
                        Math.round(this._dragState.popupY + y - this._dragState.pointerY)
                    );
                }
                return Clutter.EVENT_STOP;
            });

            this._dragReleaseSignal = global.stage.connect('button-release-event', (stage, releaseEvent) => {
                if (releaseEvent.get_button() === 1) {
                    this._finishPopupDragging();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });

            return Clutter.EVENT_STOP;
        });
    }

    _finishPopupDragging() {
        this._dragState = null;
        if (this._dragMotionSignal) {
            global.stage.disconnect(this._dragMotionSignal);
            this._dragMotionSignal = 0;
        }
        if (this._dragReleaseSignal) {
            global.stage.disconnect(this._dragReleaseSignal);
            this._dragReleaseSignal = 0;
        }
    }

    _togglePopup() {
        if (this._popup.visible) {
            this._closePopup();
        } else {
            // Guardar la ventana destino antes de interactuar con el popup.
            this._targetWindow = global.display.focus_window;
            if (!this._positionInitialized) {
                const monitor = Main.layoutManager.primaryMonitor;
                this._popup.set_position(
                    monitor.x + Math.floor((monitor.width - 350) / 2),
                    monitor.y + Math.floor((monitor.height - 450) / 2)
                );
                this._positionInitialized = true;
            }

            // Traer el widget al frente por encima de las ventanas de las aplicaciones
            Main.uiGroup.set_child_above_sibling(this._popup, null);

            try {
                this._switchTab('clipboard');
            } catch (e) {
                // Un error renderizando una entrada no debe impedir que se abra el popup.
                console.error('[Clipboard] Error al dibujar el historial:', e);
            }

            this._popup.show();
            console.log(`[Clipboard] Popup mostrado. visible=${this._popup.visible}; elementos=${this._history.length}`);
        }
    }

    disable() {

        if (this._internalCopyTimeoutId) {
            GLib.source_remove(this._internalCopyTimeoutId);
            this._internalCopyTimeoutId = 0;
        }
        if (this._pasteDelayId) {
            GLib.source_remove(this._pasteDelayId);
            this._pasteDelayId = 0;
        }
        if (this._injectDelayId) {
            GLib.source_remove(this._injectDelayId);
            this._injectDelayId = 0;
        }
        if (this._reopenDelayId) {
            GLib.source_remove(this._reopenDelayId);
            this._reopenDelayId = 0;
        }
        this._finishPopupDragging();
        this._virtualKeyboard = null;
        this._targetWindow = null;

        if (this._accelBindingName) {
            Main.wm.allowKeybinding(
                this._accelBindingName,
                Shell.ActionMode.NONE
            );

            this._accelBindingName = null;
        }
        if (this._selectionSignal) {
            global.display.get_selection().disconnect(this._selectionSignal);
            this._selectionSignal = null;
        }

        if (this._accelSignal) {
            global.display.disconnect(this._accelSignal);
            this._accelSignal = null;
        }

        if (this._accelAction !== Meta.KeyBindingAction.NONE) {
            global.display.ungrab_accelerator(this._accelAction);
            this._accelAction = Meta.KeyBindingAction.NONE;
        }

        if (this._popup) {
            this._popup.destroy();
            this._popup = null;
        }
    }
}