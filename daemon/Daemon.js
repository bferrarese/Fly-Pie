//////////////////////////////////////////////////////////////////////////////////////////
//   _____       _             _____ _                                                  //
//  |   __|_ _ _|_|___ ___ ___|  _  |_|___   This software may be modified and distri-  //
//  |__   | | | | |   | . |___|   __| | -_|  buted under the terms of the MIT license.  //
//  |_____|_____|_|_|_|_  |   |__|  |_|___|  See the LICENSE file for details.          //
//                    |___|                                                             //
//////////////////////////////////////////////////////////////////////////////////////////

'use strict';

const {Gio, GLib} = imports.gi;

const Me            = imports.misc.extensionUtils.getCurrentExtension();
const DBusInterface = Me.imports.common.DBusInterface.DBusInterface;
const Menu          = Me.imports.daemon.Menu.Menu;
const utils         = Me.imports.common.utils;
const ItemRegistry  = Me.imports.common.ItemRegistry;
const Shortcuts     = Me.imports.daemon.Shortcuts.Shortcuts;

//////////////////////////////////////////////////////////////////////////////////////////
// The daemon listens on the D-Bus for show-menu requests and registers a global hotkey //
// for each configured menu. For details on the D-Bus interface refer to                //
// common/DBusInterface.js. As soon as a valid request is received or a hotkey is       //
// pressed, an menu is shown accordingly.                                               //
//////////////////////////////////////////////////////////////////////////////////////////

var Daemon = class Daemon {

  // ------------------------------------------------------------ constructor / destructor

  constructor() {

    // Make the ShowMenu(), PreviewMenu(), ShowCustomMenu(), and the PreviewCustomMenu()
    // methods available on the D-Bus.
    this._dbus = Gio.DBusExportedObject.wrapJSObject(DBusInterface.description, this);
    this._dbus.export(Gio.DBus.session, '/org/gnome/shell/extensions/swingpie');

    // Initialize the menu. The same menu is used again and again. It is just reconfigured
    // according to incoming requests.
    this._menu = new Menu(
        // Called when the user selects an item in the menu. This calls the OnSelect
        // signal of the DBusInterface.
        (menuID, path) => this._onSelect(menuID, path),

        // Called when the user does no select anything in the menu. This calls the
        // OnCancel signal of the DBusInterface.
        (menuID) => this._onCancel(menuID));

    // This is increased once for every menu request.
    this._nextID = 0;

    // This class manages the global hotkeys. Once one of the registered hotkeys is
    // pressed, the corresponding menu is shown via the ShowMenu() method. If an error
    // occurred, a notification is shown.
    this._shortcuts = new Shortcuts((shortcut) => {
      for (let i = 0; i < this._menuConfigs.length; i++) {
        if (shortcut == this._menuConfigs[i].data) {
          const result = this.ShowMenu(this._menuConfigs[i].name);
          if (result < 0) {
            utils.notification(
                'Failed to open a Swing-Pie menu: ' +
                DBusInterface.getErrorDescription(result));
          }
        }
      }
    });

    // Create a settings object and listen for menu configuration changes. Once the
    // configuration changes, we bind all the configured shortcuts.
    this._settings = utils.createSettings();
    this._settings.connect(
        'changed::menu-configuration', () => this._onMenuConfigsChanged());
    this._onMenuConfigsChanged();
  }

  // Cleans up stuff which is not cleaned up automatically.
  destroy() {
    this._menu.destroy();
    this._dbus.unexport();
    this._shortcuts.destroy();
  }

  // -------------------------------------------------------------- public D-Bus-Interface

  // These are directly called via the DBus. See common/DBusInterface.js for a description
  // of Swing-Pie's DBusInterface.
  ShowMenu(name) {
    return this._openMenu(name, false);
  }

  PreviewMenu(name) {
    return this._openMenu(name, true);
  }

  ShowCustomMenu(json) {
    return this._openCustomMenu(json, false);
  }

  PreviewCustomMenu(json) {
    return this._openCustomMenu(json, true);
  }

  // ----------------------------------------------------------------------- private stuff

  // Opens a menu configured with Swing-Pie's menu editor, optionally in preview mode. The
  // menu's name must be given as parameter. It will return a positive number on success
  // and a negative on failure. See common/DBusInterface.js for a list of error codes.
  _openMenu(name, previewMode) {
    for (let i = 0; i < this._menuConfigs.length; i++) {

      // Search for the correct menu.
      if (name == this._menuConfigs[i].name) {

        // Transform the configuration into a menu structure.
        const config = this._transformConfig(this._menuConfigs[i]);

        // Open the menu with the custom-menu method.
        const result = this._openCustomMenu(config, previewMode);

        // If that was successful, store the config.
        if (result >= 0) {
          this._currentMenuConfig = config;
        }

        return result;
      }
    }

    // There is no menu with such a name.
    return DBusInterface.errorCodes.eNoSuchMenu;
  }

  // Open the menu described by 'config', optionally in preview mode. 'config' can either
  // be a JSON string or an object containing the menu structure. This method will return
  // the menu's ID on success or an error code on failure. See common/DBusInterface.js for
  // a list of error codes.
  _openCustomMenu(config, previewMode) {

    let structure = config;

    // First try to parse the menu structure if it's given as a json string.
    if (typeof config === 'string') {
      try {
        structure = JSON.parse(config);
      } catch (error) {
        logError(error);
        return DBusInterface.errorCodes.eInvalidJSON;
      }
    }

    // Then try to open the menu. This will return the menu's ID on success or an error
    // code on failure.
    try {
      return this._menu.show(this._nextID++, structure, previewMode);
    } catch (error) {
      logError(error);
    }

    // Something weird happened.
    return DBusInterface.errorCodes.eUnknownError;
  }

  // This gets called once the user made a selection in the menu.
  _onSelect(menuID, path) {

    // This is set if we opened one of the menus configured with Swing-Pie's menu editor.
    // Else it was a custom menu opened via the D-Bus.
    if (this._currentMenuConfig != null) {

      // The path is a string like /2/2/4 indicating that the fourth entry in the second
      // entry of the second entry was clicked on.
      const pathElements = path.split('/');

      // Now follow the path in our menu structure.
      let item = this._currentMenuConfig;
      for (let i = 1; i < pathElements.length; ++i) {
        item = item.children[pathElements[i]];
      }

      // And finally activate the item!
      item.activate();

      // The menu is now hidden.
      this._currentMenuConfig = null;

    } else {

      // It's been a custom menu, so emit the OnSelect signal of our D-Bus interface.
      this._dbus.emit_signal('OnSelect', GLib.Variant.new('(is)', [menuID, path]));
    }
  }

  // This gets called when the user did not select anything in the menu.
  _onCancel(menuID) {

    // This is set if we opened one of the menus configured with Swing-Pie's menu editor.
    // Else it was a custom menu opened via the D-Bus.
    if (this._currentMenuConfig != null) {

      // The menu is now hidden.
      this._currentMenuConfig = null;

    } else {

      // It's been a custom menu, so emit the OnCancel signal of our D-Bus interface.
      this._dbus.emit_signal('OnCancel', GLib.Variant.new('(i)', [menuID]));
    }
  }

  // This uses the createItem() methods of the ItemRegistry to transform a menu
  // configuration (as created by Swing-Pie's menu editor) to a menu structure (as
  // required by the menu class). The main difference is that the menu structure may
  // contain significantly more items - while the menu configuration only contains one
  // item for "Bookmarks", the menu structure actually contains all of the bookmarks as
  // individual items.
  _transformConfig(config) {
    const result = ItemRegistry.ItemTypes[config.type].createItem(
        config.name, config.icon, config.angle, config.data);

    // Load all children recursively.
    for (let i = 0; i < config.children.length; i++) {
      result.children.push(this._transformConfig(config.children[i]));
    }

    return result;
  }

  // Whenever the menu configuration changes, we check for any new hotkeys which need to
  // be bound.
  _onMenuConfigsChanged() {

    // Store the new menu configuration.
    this._menuConfigs = JSON.parse(this._settings.get_string('menu-configuration'));

    // First we create a set of all required hotkeys.
    const newShortcuts = new Set();
    for (let i = 0; i < this._menuConfigs.length; i++) {
      if (this._menuConfigs[i].data != '') {
        // The hotkey is stored in the menus data property.
        newShortcuts.add(this._menuConfigs[i].data);
      }
    }

    // Then we iterate over all currently bound hotkeys and unbind the ones which are not
    // required anymore and remove the one which are already bound from the set of
    // required hotkeys.
    for (let existingShortcut of this._shortcuts.getBound()) {
      if (newShortcuts.has(existingShortcut)) {
        newShortcuts.delete(existingShortcut);
      } else {
        this._shortcuts.unbind(existingShortcut);
      }
    }

    // Finally, we bind any remaining hotkeys from our set.
    for (let requiredShortcut of newShortcuts) {
      this._shortcuts.bind(requiredShortcut);
    }
  }
};