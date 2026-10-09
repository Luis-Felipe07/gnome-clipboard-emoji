import St from 'gi://St';
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
                    if (this._isInternalCopy) {
                        this._isInternalCopy = false;
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
        let mimetypes = selection.get_mimetypes(Meta.SelectionType.SELECTION_CLIPBOARD) || [];

        if (mimetypes.includes('image/png')) {
            this._fetchImageContent(selection);
        } else {
            this._fetchTextContent();
        }
    }

    _fetchImageContent(selection) {
        selection.transfer_async(
            Meta.SelectionType.SELECTION_CLIPBOARD,
            'image/png',
            null,
            null,
            (sel, res) => {
                try {
                    let stream = sel.transfer_finish(res);
                    if (!stream) return;

                    let filePath = GLib.build_filenamev([this._cacheDir, `img_${Date.now()}.png`]);
                    let file = Gio.File.new_for_path(filePath);
                    let outStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);

                    outStream.splice_async(
                        stream,
                        Gio.OutputStreamSpliceFlags.CLOSE_TARGET | Gio.OutputStreamSpliceFlags.CLOSE_SOURCE,
                        GLib.PRIORITY_DEFAULT,
                        null,
                        (obj, splicesRes) => {
                            try {
                                outStream.splice_finish(splicesRes);
                                this._addHistoryItem({ type: 'image', path: filePath });
                            } catch (e) {
                                console.error('[Clipboard] Error al guardar imagen:', e);
                            }
                        }
                    );
                } catch (e) {
                    console.error('[Clipboard] Error al transferir imagen:', e);
                }
            }
        );
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

        let tabBox = new St.BoxLayout({ style_class: 'tab-box' });
        
        let btnClipboardTab = new St.Button({ label: '📋 Portapapeles', style_class: 'tab-button' });
        let btnEmojiTab = new St.Button({ label: '😀 Emojis', style_class: 'tab-button' });

        btnClipboardTab.connect('clicked', () => this._switchTab('clipboard'));
        btnEmojiTab.connect('clicked', () => this._switchTab('emoji'));

        tabBox.add_child(btnClipboardTab);
        tabBox.add_child(btnEmojiTab);
        this._popup.add_child(tabBox);

        this._contentStack = new St.BoxLayout({ vertical: true, style_class: 'content-area' });
        this._popup.add_child(this._contentStack);

        Main.uiGroup.add_child(this._popup);
        this._switchTab('clipboard');
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
        let scrollView = new St.ScrollView({ style_class: 'scroll-container' });
        let listContainer = new St.BoxLayout({ vertical: true, style_class: 'item-list' });

        if (this._history.length === 0) {
            let emptyLabel = new St.Label({ text: 'El historial está vacío', style_class: 'empty-label' });
            listContainer.add_child(emptyLabel);
        } else {
            this._history.forEach((item) => {
                let itemBtn;

                if (item.type === 'text') {
                    itemBtn = new St.Button({
                        label: item.content.length > 40 ? item.content.substring(0, 40) + '...' : item.content,
                        style_class: 'history-item'
                    });

                    itemBtn.connect('clicked', () => {
                        this._isInternalCopy = true;
                        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.content);
                        this._popup.hide();
                    });
                } else if (item.type === 'image') {
                    let gicon = Gio.FileIcon.new(Gio.File.new_for_path(item.path));
                    let iconWidget = new St.Icon({
                        gicon: gicon,
                        icon_size: 120,
                        style_class: 'image-preview'
                    });

                    itemBtn = new St.Button({
                        child: iconWidget,
                        style_class: 'history-item history-item-img'
                    });

                    itemBtn.connect('clicked', () => {
                        this._copyImageToClipboard(item.path);
                        this._popup.hide();
                    });
                }

                listContainer.add_child(itemBtn);
            });
        }

        scrollView.add_child(listContainer);
        this._contentStack.add_child(scrollView);
    }

    _copyImageToClipboard(filePath) {
        try {
            let file = Gio.File.new_for_path(filePath);
            let bytes = file.load_bytes(null);
            if (bytes) {
                let source = new Meta.SelectionSourceMemory({
                    mimetype: 'image/png',
                    content: bytes
                });
                this._isInternalCopy = true;
                global.display.get_selection().set_owner(Meta.SelectionType.SELECTION_CLIPBOARD, source);
            }
        } catch (e) {
            console.error('[Clipboard] Error al restaurar imagen:', e);
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
                    this._isInternalCopy = true;
                    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.char);
                    this._popup.hide();
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

    _togglePopup() {
        if (this._popup.visible) {
            this._popup.hide();
        } else {
            let monitor = Main.layoutManager.primaryMonitor;
            this._popup.set_position(
                monitor.x + Math.floor((monitor.width - 340) / 2),
                monitor.y + Math.floor((monitor.height - 440) / 2)
            );
            
            // Traer el widget al frente por encima de las ventanas de las aplicaciones
            Main.uiGroup.set_child_above_sibling(this._popup, null);
            
            this._switchTab('clipboard');
            this._popup.show();
        }
    }

    disable() {

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