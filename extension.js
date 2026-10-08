import St from 'gi://St'
import Meta from 'gi://Meta'
import Shell from 'gi://Shell'
import Clutter from 'gi://Cluter'
import Glib from 'gi://Glib'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js'

export default class ClipboardEmojiExtension extends Extension {

    enable() {
        this._history = []
        this._maxHistory = 20
        this._accelAction = Meta.KeyBindingAction.NONE
        this._cacheDir = 'tmp/clip_cache'

        Glib.mkdir_with_parents(this._cacheDir, 0o755)

        // escuchar eventos de portapapeles 
        this._setupClipboardListener()
        this._setupKeyboardShortcut()
        this._loadEmojiData()
        this._buildUI()

    }

    /**
     * Escucha cambios en el portapapeles en tiempo real (Wayland / X11).
     * Se conecta a la señal 'owner-changed' de Meta.Selection.
     */
    _setupClipboardListener() {
        const selection = global.display.get_selection()

        this._selectionSignal = selection.connect('owner-changed', (sel, selectionType) => {
            if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
                this._fetchClipboardContent(sel)
            }
        });
    }

    _fetchClipboardContent(selection) {
        let mimetypes = selection.get_mimetypes(Meta.SelectionType.SELECTION_CLIPBOARD) || []

        //cap pantalla 
        if (mimetypes.includes('image/png')) {
            this._fetchImageContent(selection);
        } else {
            //texto plano 
            this._fetchTextContent()
        }
    }

    _fetchImageContent(selection) {
        selection.transfer_async(
            Meta.SelectionType.SELECTION_CLIPBOARD, 'image/png', null, null,
            (sel, res) => {
                try {
                    let stream = sel.transfer_finish(res)
                    if (!stream) return;

                    let filePath = `${this._cacheDir}/img_${Date.now()}.png`
                    let file = Geolocation.File.new_for_path(filePath)
                    let outStream = file.replace(null, false, Gio.FileCreateFlags.NONE, null)

                    outStream.splice_asycn(
                        stream,
                        Gio.outputStreamSpliceFlags.CLOSE_TARGET | Gio.outputStreamSpliceFlags.CLOSE_SOURCE,
                        GLib.PRIORITY_DEFAULT,
                        null,
                        (obj, splicesRes) => {
                            try {
                                outStream.splice_finish(splicesRes)
                                this._addHistoryItem({ type: 'image', path: filePath })
                            } catch (e) {
                                console.error('[Clipboard] Error , no se pudo guardar la imagen: ', e)
                            }
                        }
                    );
                } catch (e) {
                    console.error('[Clipboard]', 'Error al transferir seleccion de imagen ', e)
                }
            }
        );
    }

    _fetchTextContent() {
        St.Clipboard.get_default().get_text(St.ClipboardType.Clipboard, (clipboard, text) => {
            if (text && text.trim().length > 0) {
                this._addHistoryItem({ type: 'text', content: text })
            }
        });


    }
    _addHistoryItem(newItem) {
        // Evitar dupli
        if (this._history.length > 0) {
            let last = this._history[0];
            if (newItem.type === 'text' && last.type === 'text' && last.content === newItem.content) return;
            if (newItem.type === 'image' && last.type === 'image' && last.path === newItem.path) return;
        }
        this._history.unshift(newItem);

        if (this._history.length > this._maxHistory) {
            let removed = this._history.pop();
            // Borrar imagen antigua del disco si aplica
            if (removed.type === 'image') {
                let file = Gio.File.new_for_path(removed.path);
                file.delete_async(GLib.PRIORITY_DEFAULT, null, null);
            }
        }

        this._refreshClipboardUI();
    }

    //cap win + v
    _setupKeyboardShortcut() {
        this._accelAction = global.display.grab_accelerator('<Super>v', Meta.AcceleratorFlags.NONE);

        if (this._accelAction !== Meta.KeyBindingAction.NONE) {
            this._accelSignal = global.display.connect('accelerator-activated', (display, action) => {
                if (action === this._accelAction) {
                    this._togglePopup();
                }
            });
        }
    }


}



