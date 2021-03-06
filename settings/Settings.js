//////////////////////////////////////////////////////////////////////////////////////////
//        ___            _     ___                                                      //
//        |   |   \/    | ) |  |           This software may be modified and distri-    //
//    O-  |-  |   |  -  |   |  |-  -O      buted under the terms of the MIT license.    //
//        |   |_  |     |   |  |_          See the LICENSE file for details.            //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

'use strict';

const {Gtk, Gio, Gdk} = imports.gi;

const Me            = imports.misc.extensionUtils.getCurrentExtension();
const utils         = Me.imports.common.utils;
const DBusInterface = Me.imports.common.DBusInterface.DBusInterface;
const Preset        = Me.imports.settings.Preset.Preset;
const MenuEditor    = Me.imports.settings.MenuEditor.MenuEditor;
const Tutorial      = Me.imports.settings.Tutorial.Tutorial;
const ExampleMenu   = Me.imports.settings.ExampleMenu.ExampleMenu;

const DBusWrapper = Gio.DBusProxy.makeProxyWrapper(DBusInterface.description);

//////////////////////////////////////////////////////////////////////////////////////////
// This class loads the user interface defined in settings.ui and connects all elements //
// to the corresponding settings items of the Gio.Settings at                           //
// org.gnome.shell.extensions.flypie. All these connections work both ways - when a     //
// slider is moved in the user interface the corresponding settings key will be         //
// updated and when a settings key is modified, the corresponding slider is moved.      //
//////////////////////////////////////////////////////////////////////////////////////////

var Settings = class Settings {

  // ------------------------------------------------------------ constructor / destructor

  constructor() {

    // Create the Gio.Settings object.
    this._settings = utils.createSettings();

    // Load the user interface file.
    this._builder = new Gtk.Builder();
    this._builder.add_from_file(Me.path + '/settings/settings.ui');

    // Initialize the Menu Editor page. To structure the source code, this has been put
    // into a separate class.
    this._menuEditor = new MenuEditor(this._builder, this._settings);

    // Initialize the Tutorial page. To structure the source code, this has been put
    // into a separate class.
    this._tutorial = new Tutorial(this._builder, this._settings);

    // Show current version number in about-popover.
    this._builder.get_object('app-name').label = 'Fly-Pie ' + Me.metadata.version;

    // Initialize all buttons of the preset area.
    this._initializePresetButtons();

    // Connect to the server so that we can toggle menus also from the preferences. This
    // is, for example, used for toggling the Live-Preview.
    new DBusWrapper(
        Gio.DBus.session, 'org.gnome.Shell', '/org/gnome/shell/extensions/flypie',
        proxy => this._dbus = proxy);

    // Show the Demo Menu when the Preview Button is pressed.
    const previewButton = this._builder.get_object('preview-button');
    previewButton.connect('clicked', () => {
      if (this._dbus) {
        this._dbus.PreviewCustomMenuRemote(JSON.stringify(ExampleMenu.get()), () => {});
      }
    });

    // Draw icons to the Gtk.DrawingAreas of the appearance tabs.
    this._createAppearanceTabIcons();

    // Now connect the user interface elements to the settings items. All user interface
    // elements have the same ID as the corresponding settings key. Sometimes there is
    // also a <key>-hover variant and a reset-<key> button. All three are connected with
    // the _bind* calls.

    // General Settings.
    this._bindSlider('global-scale');
    this._bindSlider('easing-duration');
    this._bindCombobox('easing-mode');
    this._bindColorButton('background-color');
    this._bindColorButton('text-color');
    this._bindFontButton('font');


    // Wedge Settings.
    this._bindSlider('wedge-width');
    this._bindSlider('wedge-inner-radius');
    this._bindColorButton('wedge-color');
    this._bindColorButton('wedge-separator-color');
    this._bindSlider('wedge-separator-width');

    // Center Item Settings.
    this._bindRadioGroup('center-color-mode', ['fixed', 'auto']);
    this._bindColorButton('center-fixed-color');
    this._bindSlider('center-auto-color-saturation');
    this._bindSlider('center-auto-color-luminance');
    this._bindSlider('center-auto-color-opacity');
    this._bindSlider('center-size');
    this._bindSlider('center-icon-scale');
    this._bindSlider('center-icon-opacity');

    // Toggle the color revealers when the color mode radio buttons are toggled.
    this._bindRevealer('center-color-mode-fixed', 'center-fixed-color-revealer');
    this._bindRevealer('center-color-mode-auto', 'center-auto-color-revealer');
    this._bindRevealer(
        'center-color-mode-hover-fixed', 'center-fixed-color-hover-revealer');
    this._bindRevealer(
        'center-color-mode-hover-auto', 'center-auto-color-hover-revealer');

    // The color reset button resets various settings, so we bind it manually.
    this._builder.get_object('reset-center-color').connect('clicked', () => {
      this._settings.reset('center-color-mode');
      this._settings.reset('center-color-mode-hover');
      this._settings.reset('center-fixed-color');
      this._settings.reset('center-fixed-color-hover');
      this._settings.reset('center-auto-color-saturation');
      this._settings.reset('center-auto-color-saturation-hover');
      this._settings.reset('center-auto-color-luminance');
      this._settings.reset('center-auto-color-luminance-hover');
      this._settings.reset('center-auto-color-opacity');
      this._settings.reset('center-auto-color-opacity-hover');
    });

    // The copy-color-settings button copies various settings, so we bind it manually.
    this._builder.get_object('copy-center-color').connect('clicked', () => {
      this._copyToHover('center-color-mode');
      this._copyToHover('center-fixed-color');
      this._copyToHover('center-auto-color-saturation');
      this._copyToHover('center-auto-color-luminance');
      this._copyToHover('center-auto-color-opacity');
    });


    // Child Item Settings.
    this._bindRadioGroup('child-color-mode', ['fixed', 'auto', 'parent']);
    this._bindColorButton('child-fixed-color');
    this._bindSlider('child-auto-color-saturation');
    this._bindSlider('child-auto-color-luminance');
    this._bindSlider('child-auto-color-opacity');
    this._bindSlider('child-size');
    this._bindSlider('child-offset');
    this._bindSlider('child-icon-scale');
    this._bindSlider('child-icon-opacity');
    this._bindSwitch('child-draw-above');

    // Toggle the color revealers when the color mode radio buttons are toggled.
    this._bindRevealer('child-color-mode-fixed', 'child-fixed-color-revealer');
    this._bindRevealer('child-color-mode-auto', 'child-auto-color-revealer');
    this._bindRevealer(
        'child-color-mode-hover-fixed', 'child-fixed-color-hover-revealer');
    this._bindRevealer('child-color-mode-hover-auto', 'child-auto-color-hover-revealer');

    // The color reset button resets various settings, so we bind it manually.
    this._builder.get_object('reset-child-color').connect('clicked', () => {
      this._settings.reset('child-color-mode');
      this._settings.reset('child-color-mode-hover');
      this._settings.reset('child-fixed-color');
      this._settings.reset('child-auto-color-saturation');
      this._settings.reset('child-auto-color-luminance');
      this._settings.reset('child-auto-color-opacity');
      this._settings.reset('child-fixed-color-hover');
      this._settings.reset('child-auto-color-saturation-hover');
      this._settings.reset('child-auto-color-luminance-hover');
      this._settings.reset('child-auto-color-opacity-hover');
    });

    // The copy-color-settings button copies various settings, so we bind it manually.
    this._builder.get_object('copy-child-color').connect('clicked', () => {
      this._copyToHover('child-color-mode');
      this._copyToHover('child-fixed-color');
      this._copyToHover('child-auto-color-saturation');
      this._copyToHover('child-auto-color-luminance');
      this._copyToHover('child-auto-color-opacity');
      this._copyToHover('child-fixed-color-hover');
    });


    // Grandchild Item Settings.
    this._bindRadioGroup('grandchild-color-mode', ['fixed', 'parent']);
    this._bindColorButton('grandchild-fixed-color');
    this._bindSlider('grandchild-size');
    this._bindSlider('grandchild-offset');
    this._bindSwitch('grandchild-draw-above');

    // Toggle the color revealers when the color mode radio buttons are toggled.
    this._bindRevealer('grandchild-color-mode-fixed', 'grandchild-fixed-color-revealer');
    this._bindRevealer(
        'grandchild-color-mode-hover-fixed', 'grandchild-fixed-color-hover-revealer');

    // The color reset button resets various settings, so we bind it manually.
    this._builder.get_object('reset-grandchild-color').connect('clicked', () => {
      this._settings.reset('grandchild-color-mode');
      this._settings.reset('grandchild-color-mode-hover');
      this._settings.reset('grandchild-fixed-color');
      this._settings.reset('grandchild-fixed-color-hover');
    });

    // The copy-color-settings button copies various settings, so we bind it manually.
    this._builder.get_object('copy-grandchild-color').connect('clicked', () => {
      this._copyToHover('grandchild-color-mode');
      this._copyToHover('grandchild-fixed-color');
    });


    // Trace Settings.
    this._bindColorButton('trace-color');
    this._bindSlider('trace-min-length');
    this._bindSlider('trace-thickness');

    // Advanced Settings
    this._bindSlider('gesture-selection-timeout');
    this._bindSlider('gesture-jitter-threshold');
    this._bindSlider('gesture-min-stroke-length');
    this._bindSlider('gesture-min-stroke-angle');
    this._bindSwitch('show-screencast-mouse');


    // This is our top-level widget which we will return later.
    this._widget = this._builder.get_object('main-notebook');

    // Because it looks cool, we add the stack switcher and the about button to the
    // window's title bar.
    this._widget.connect('realize', () => {
      const stackSwitcher = this._builder.get_object('main-stack-switcher');
      const aboutButton   = this._builder.get_object('about-button');

      stackSwitcher.parent.remove(aboutButton);
      stackSwitcher.parent.remove(stackSwitcher);

      const titlebar = this._widget.get_toplevel().get_titlebar();
      titlebar.set_custom_title(stackSwitcher);
      titlebar.pack_start(aboutButton);
    });

    // Save the currently active settings page. This way, the tutorial will be shown when
    // the settings dialog is shown for the first time. Then, when the user modified
    // something on another page, this will be shown when the settings dialog is shown
    // again.
    const stack              = this._builder.get_object('main-stack');
    stack.visible_child_name = this._settings.get_string('active-stack-child');
    stack.connect('notify::visible-child-name', (stack) => {
      this._settings.set_string('active-stack-child', stack.visible_child_name);
    });
  }

  // -------------------------------------------------------------------- public interface

  // Returns the widget used for the settings of this extension.
  getWidget() {
    return this._widget;
  }

  // ----------------------------------------------------------------------- private stuff

  // This initializes the widgets related to the presets.
  _initializePresetButtons() {

    // Store some members will will use frequently.
    this._presetDirectory = Gio.File.new_for_path(Me.path + '/presets');
    this._presetList      = this._builder.get_object('preset-list');

    //  The sort column and type cannot be set in glade, so we do this here.
    this._presetList.set_sort_column_id(1, Gtk.SortType.ASCENDING);

    // Now add all presets to the user interface. We simply assume all *.json files in the
    // preset directory to be presets. No further checks are done for now...
    const presets = this._presetDirectory.enumerate_children(
        'standard::*', Gio.FileQueryInfoFlags.NONE, null);

    while (true) {
      const presetInfo = presets.next_file(null);

      if (presetInfo == null) {
        break;
      }

      if (presetInfo.get_file_type() == Gio.FileType.REGULAR) {
        const suffixPos = presetInfo.get_display_name().indexOf('.json');
        if (suffixPos > 0) {
          const presetFile = this._presetDirectory.get_child(presetInfo.get_name());
          const row        = this._presetList.append();
          const presetName = presetInfo.get_display_name().slice(0, suffixPos);
          this._presetList.set_value(row, 0, presetName);
          this._presetList.set_value(row, 1, presetFile.get_path());
        }
      }
    }

    // Load a preset whenever the selection changes.
    this._builder.get_object('preset-treeview')
        .connect('row-activated', (treeview, path) => {
          try {
            const [ok, iter] = treeview.get_model().get_iter(path);
            if (ok) {
              const path = treeview.get_model().get_value(iter, 1);
              Preset.load(Gio.File.new_for_path(path));
            }

          } catch (error) {
            utils.debug('Failed to load Preset: ' + error);
          }
        });

    // Open a save-dialog when the save button is pressed.
    this._builder.get_object('save-preset-button').connect('clicked', (button) => {
      const dialog = new Gtk.FileChooserDialog({
        title: 'Save Preset',
        action: Gtk.FileChooserAction.SAVE,
        do_overwrite_confirmation: true,
        transient_for: button.get_toplevel(),
        modal: true
      });

      // Show only *.json files per default.
      const jsonFilter = new Gtk.FileFilter();
      jsonFilter.set_name('JSON Files');
      jsonFilter.add_mime_type('application/json');
      dialog.add_filter(jsonFilter);

      // But allow showing all files if required.
      const allFilter = new Gtk.FileFilter();
      allFilter.add_pattern('*');
      allFilter.set_name('All Files');
      dialog.add_filter(allFilter);

      // Add our action buttons.
      dialog.add_button('Cancel', Gtk.ResponseType.CANCEL);
      dialog.add_button('Save', Gtk.ResponseType.OK);

      // Show the preset directory per default.
      dialog.set_current_folder_uri(this._presetDirectory.get_uri());

      // Also make updating presets easier by pre-filling the file input field with the
      // currently selected preset.
      const presetSelection   = this._builder.get_object('preset-selection');
      const [ok, model, iter] = presetSelection.get_selected();
      if (ok) {
        const name = model.get_value(iter, 0);
        dialog.set_current_name(name + '.json');
      }

      // Save preset file when the OK button is clicked.
      dialog.connect('response', (dialog, response_id) => {
        if (response_id === Gtk.ResponseType.OK) {
          try {
            let path = dialog.get_filename();

            // Make sure we have a *.json extension.
            if (!path.endsWith('.json')) {
              path += '.json';
            }

            // Now save the preset!
            const file    = Gio.File.new_for_path(path);
            const exists  = file.query_exists(null);
            const success = Preset.save(file);

            // If this was successful, we add the new preset to the list.
            if (success && !exists) {
              const fileInfo =
                  file.query_info('standard::*', Gio.FileQueryInfoFlags.NONE, null);
              const suffixPos  = fileInfo.get_display_name().indexOf('.json');
              const row        = this._presetList.append();
              const presetName = fileInfo.get_display_name().slice(0, suffixPos);
              this._presetList.set_value(row, 0, presetName);
              this._presetList.set_value(row, 1, file.get_path());
            }

          } catch (error) {
            utils.debug('Failed to save preset: ' + error);
          }
        }

        dialog.destroy();
      });

      dialog.show();
    });

    // Open the preset directory with the default file manager.
    this._builder.get_object('open-preset-directory-button').connect('clicked', () => {
      Gio.AppInfo.launch_default_for_uri(this._presetDirectory.get_uri(), null);
    });

    // Create a random preset when the corresponding button is pressed.
    this._builder.get_object('random-preset-button').connect('clicked', () => {
      Preset.random();
    });
  }

  // This is used by all the methods below. It checks whether there is a button called
  // 'reset-*whatever*' in the user interface. If so, it binds a click-handler to that
  // button resetting the corresponding settings key. It will also reset any setting
  // called 'settingsKey-hover' if one such exists.
  _bindResetButton(settingsKey) {
    const resetButton = this._builder.get_object('reset-' + settingsKey);
    if (resetButton) {
      resetButton.connect('clicked', () => {
        this._settings.reset(settingsKey);
        if (this._settings.settings_schema.has_key(settingsKey + '-hover')) {
          this._settings.reset(settingsKey + '-hover');
        }
      });
    }
  }

  // This small helper method copies the settings value identified by <settingsKey> to the
  // value identified with <settingsKey>-hover.
  _copyToHover(settingsKey) {
    this._settings.set_value(
        settingsKey + '-hover', this._settings.get_value(settingsKey));
  }

  // This checks whether there is a copy-settings button for the given settings key and if
  // so, binds the _copyToHover method to it.
  _bindCopyButton(settingsKey) {
    const copyButton = this._builder.get_object('copy-' + settingsKey);
    if (copyButton) {
      copyButton.connect('clicked', () => {
        this._copyToHover(settingsKey);
      });
    }
  }

  // Connects a Gtk.Range (or anything else which has a 'value' property) to a settings
  // key. It also binds any corresponding reset buttons and '-hover' variants if they
  // exist.
  _bindSlider(settingsKey) {
    this._bind(settingsKey, 'value');
  }

  // Connects a Gtk.Switch (or anything else which has an 'active' property) to a settings
  // key. It also binds any corresponding reset buttons and '-hover' variants if they
  // exist.
  _bindSwitch(settingsKey) {
    this._bind(settingsKey, 'active');
  }

  // Connects a Gtk.FontButton (or anything else which has a 'font-name' property) to a
  // settings key. It also binds any corresponding reset buttons and '-hover' variants if
  // they exist.
  _bindFontButton(settingsKey) {
    this._bind(settingsKey, 'font-name');
  }

  // Connects a Gtk.ComboBox (or anything else which has an 'active-id' property) to a
  // settings key. It also binds any corresponding reset buttons and '-hover' variants if
  // they exist.
  _bindCombobox(settingsKey) {
    this._bind(settingsKey, 'active-id');
  }

  // Connects any widget's property to a settings key. The widget must have the same ID as
  // the settings key. It also binds any corresponding reset buttons and '-hover' variants
  // if they exist.
  _bind(settingsKey, property) {
    this._settings.bind(
        settingsKey, this._builder.get_object(settingsKey), property,
        Gio.SettingsBindFlags.DEFAULT);

    if (this._settings.settings_schema.has_key(settingsKey + '-hover')) {
      this._settings.bind(
          settingsKey + '-hover', this._builder.get_object(settingsKey + '-hover'),
          property, Gio.SettingsBindFlags.DEFAULT);
    }

    this._bindResetButton(settingsKey);
    this._bindCopyButton(settingsKey);
  }

  // Connects a group of Gtk.RadioButtons to a string property of the settings. Foreach
  // 'value' in 'possibleValues', a toggle-handler is added to a button called
  // 'settingsKey-value'. This handler sets the 'settingsKey' to 'value'. The button state
  // is also updated when the corresponding setting changes.
  _bindRadioGroup(settingsKey, possibleValues) {

    // This is called once for 'settingsKey' and once for 'settingsKey-hover'.
    const impl = (settingsKey, possibleValues) => {
      possibleValues.forEach(value => {
        const button = this._builder.get_object(settingsKey + '-' + value);
        button.connect('toggled', () => {
          if (button.active) {
            this._settings.set_string(settingsKey, value);
          }
        });
      });

      // Update the button state when the settings change.
      const settingSignalHandler = () => {
        const value   = this._settings.get_string(settingsKey);
        const button  = this._builder.get_object(settingsKey + '-' + value);
        button.active = true;
      };

      this._settings.connect('changed::' + settingsKey, settingSignalHandler);

      // Initialize the button with the state in the settings.
      settingSignalHandler();
    };

    // Bind the normal settingsKey.
    impl(settingsKey, possibleValues);

    // And any '-hover' variant if present.
    if (this._settings.settings_schema.has_key(settingsKey + '-hover')) {
      impl(settingsKey + '-hover', possibleValues);
    }

    // And bind the corresponding reset button.
    this._bindResetButton(settingsKey);
    this._bindCopyButton(settingsKey);
  }

  // Colors are stored as strings like 'rgb(1, 0.5, 0)'. As Gio.Settings.bind_with_mapping
  // is not available yet, so we need to do the color conversion manually.
  _bindColorButton(settingsKey) {

    // This is called once for 'settingsKey' and once for 'settingsKey-hover'.
    const impl = (settingsKey) => {
      const colorChooser = this._builder.get_object(settingsKey);

      colorChooser.connect('color-set', () => {
        this._settings.set_string(settingsKey, colorChooser.get_rgba().to_string());
      });

      // Update the button state when the settings change.
      const settingSignalHandler = () => {
        const rgba = new Gdk.RGBA();
        rgba.parse(this._settings.get_string(settingsKey));
        colorChooser.rgba = rgba;
      };

      this._settings.connect('changed::' + settingsKey, settingSignalHandler);

      // Initialize the button with the state in the settings.
      settingSignalHandler();
    };

    // Bind the normal settingsKey.
    impl(settingsKey);

    // And any '-hover' variant if present.
    if (this._settings.settings_schema.has_key(settingsKey + '-hover')) {
      impl(settingsKey + '-hover');
    }

    // And bind the corresponding reset button.
    this._bindResetButton(settingsKey);
    this._bindCopyButton(settingsKey);
  }

  _bindRevealer(toggleButtonID, revealerID) {
    this._builder.get_object(toggleButtonID).connect('toggled', (button) => {
      this._builder.get_object(revealerID).reveal_child = button.active;
    });

    this._builder.get_object(revealerID).reveal_child =
        this._builder.get_object(toggleButtonID).active;
  }

  // This draws the custom icons of the appearance settings tabs.
  _createAppearanceTabIcons() {

    // We have to add these events to the Gtk.DrawingAreas to make them actually
    // clickable. Else it would not be possible to select the tabs.
    const tabEvents = Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK;

    // Draw six lines representing the wedge separators.
    let tabIcon = this._builder.get_object('wedges-tab-icon');
    tabIcon.add_events(tabEvents);
    tabIcon.connect('draw', (widget, ctx) => {
      const size  = Math.min(widget.get_allocated_width(), widget.get_allocated_height());
      const color = widget.get_style_context().get_color(Gtk.StateFlags.NORMAL);

      ctx.translate(size / 2, size / 2);
      ctx.rotate(2 * Math.PI / 12);

      for (let i = 0; i < 6; i++) {
        ctx.moveTo(size / 5, 0);
        ctx.lineTo(size / 2, 0);
        ctx.rotate(2 * Math.PI / 6);
      }

      ctx.setSourceRGBA(color.red, color.green, color.blue, color.alpha);
      ctx.setLineWidth(2);
      ctx.stroke();

      return false;
    });

    // Draw on circle representing the center item.
    tabIcon = this._builder.get_object('center-tab-icon');
    tabIcon.add_events(tabEvents);
    tabIcon.connect('draw', (widget, ctx) => {
      const size  = Math.min(widget.get_allocated_width(), widget.get_allocated_height());
      const color = widget.get_style_context().get_color(Gtk.StateFlags.NORMAL);

      ctx.translate(size / 2, size / 2);
      ctx.setSourceRGBA(color.red, color.green, color.blue, color.alpha);
      ctx.arc(0, 0, size / 4, 0, 2 * Math.PI);
      ctx.fill();

      return false;
    });

    // Draw six circles representing child items.
    tabIcon = this._builder.get_object('children-tab-icon');
    tabIcon.add_events(tabEvents);
    tabIcon.connect('draw', (widget, ctx) => {
      const size  = Math.min(widget.get_allocated_width(), widget.get_allocated_height());
      const color = widget.get_style_context().get_color(Gtk.StateFlags.NORMAL);

      ctx.translate(size / 2, size / 2);
      ctx.setSourceRGBA(color.red, color.green, color.blue, color.alpha);

      for (let i = 0; i < 6; i++) {
        ctx.rotate(2 * Math.PI / 6);
        ctx.arc(size / 3, 0, size / 10, 0, 2 * Math.PI);
        ctx.fill();
      }

      return false;
    });

    // Draw six groups of five grandchildren each. The grandchild at the back-navigation
    // position is skipped.
    tabIcon = this._builder.get_object('grandchildren-tab-icon');
    tabIcon.add_events(tabEvents);
    tabIcon.connect('draw', (widget, ctx) => {
      const size  = Math.min(widget.get_allocated_width(), widget.get_allocated_height());
      const color = widget.get_style_context().get_color(Gtk.StateFlags.NORMAL);

      ctx.translate(size / 2, size / 2);
      ctx.setSourceRGBA(color.red, color.green, color.blue, color.alpha);

      for (let i = 0; i < 6; i++) {
        ctx.rotate(2 * Math.PI / 6);

        ctx.save()
        ctx.translate(size / 3, 0);
        ctx.rotate(Math.PI);

        for (let j = 0; j < 5; j++) {
          ctx.rotate(2 * Math.PI / 6);
          ctx.arc(size / 10, 0, size / 20, 0, 2 * Math.PI);
          ctx.fill();
        }

        ctx.restore();
      }

      return false;
    });

    // Draw a line and some circles representing a trace.
    tabIcon = this._builder.get_object('trace-tab-icon');
    tabIcon.add_events(tabEvents);
    tabIcon.connect('draw', (widget, ctx) => {
      const size  = Math.min(widget.get_allocated_width(), widget.get_allocated_height());
      const color = widget.get_style_context().get_color(Gtk.StateFlags.NORMAL);

      ctx.setSourceRGBA(color.red, color.green, color.blue, color.alpha);

      ctx.moveTo(0.2 * size, 0.2 * size);
      ctx.lineTo(0.4 * size, 0.6 * size);
      ctx.lineTo(0.9 * size, 0.7 * size);

      ctx.setLineWidth(2);
      ctx.stroke();

      ctx.arc(0.2 * size, 0.2 * size, 0.15 * size, 0, 2 * Math.PI);
      ctx.fill();

      ctx.arc(0.4 * size, 0.6 * size, 0.1 * size, 0, 2 * Math.PI);
      ctx.fill();

      ctx.arc(0.9 * size, 0.7 * size, 0.1 * size, 0, 2 * Math.PI);
      ctx.fill();

      return false;
    });

    // Draw three dots indicating the advanced settings.
    tabIcon = this._builder.get_object('advanced-tab-icon');
    tabIcon.add_events(tabEvents);
    tabIcon.connect('draw', (widget, ctx) => {
      const size  = Math.min(widget.get_allocated_width(), widget.get_allocated_height());
      const color = widget.get_style_context().get_color(Gtk.StateFlags.NORMAL);

      ctx.setSourceRGBA(color.red, color.green, color.blue, color.alpha);

      ctx.arc(0.15 * size, 0.5 * size, 0.1 * size, 0, 2 * Math.PI);
      ctx.fill();

      ctx.arc(0.5 * size, 0.5 * size, 0.1 * size, 0, 2 * Math.PI);
      ctx.fill();

      ctx.arc(0.85 * size, 0.5 * size, 0.1 * size, 0, 2 * Math.PI);
      ctx.fill();

      return false;
    });
  }
}