# Windows and Mac setup

## Copy to the instrument PC

Copy `dist/windows/bracketeer.exe` to the Desktop or any folder on the Windows PC. It is one file, with no installer. Double-click it to open bracketeer.

Alternatively, copy `dist/bracketeer.html` and open it in Edge. This is also one file and works offline, without a server.

The executable's only app-written config file is `window.json` in `%APPDATA%\org.bracketeer.desktop`. The project autosave, theme and panel layout live in its WebView2 storage. **Save project** and the export buttons write files where you choose; save a `.bracketeer.json` file to transfer a project to another computer.

## WebView2 Runtime

Windows 10/11 normally already have the Microsoft WebView2 Runtime used by the executable. If it is missing, install Microsoft's **Evergreen WebView2 Runtime** from the [WebView2 download page](https://developer.microsoft.com/microsoft-edge/webview2/), or use `bracketeer.html` in Edge. The portable exe does not install the runtime itself.

## SmartScreen

The executable is unsigned. If SmartScreen says **Windows protected your PC**, click **More info → Run anyway**.

## Build Windows on the Mac

Start with the development tools in the [README](../README.md#development). The Windows cross-build also needs `cargo-xwin` 0.23, the Rust target `x86_64-pc-windows-msvc`, and Homebrew `llvm` and `lld`. For an offline build, the Windows SDK/CRT cache must already be present.

```sh
make windows
```

The target builds the Tauri frontend, cross-compiles the portable executable and copies it to `dist/windows/bracketeer.exe`. It adds `/opt/homebrew/opt/llvm/bin` and `/opt/homebrew/opt/lld/bin` to PATH. No Windows machine, Visual Studio or installer tools are needed for this build.

For the single HTML file, run:

```sh
make web
```

The exe has been built on the Mac; running it on the instrument PC is still unverified. Native open/save dialogs and clipboard access also need a check by hand.

## Mac counterpart

```sh
make mac-app
```

This builds the Mac app and copies `bracketeer.app` and its `.dmg` to `dist/macos/`. Copy the app to Applications or another folder. It is unsigned and not notarized: right-click the app and choose **Open** the first time, then confirm **Open** if prompted.
