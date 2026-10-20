; Inno Setup script: per-user install, no administrator rights needed.
#define AppName "AI Text Detector"
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6C1E0B5A-4F0B-4E7B-9C61-7A2D3E8F5B10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=aidetect
DefaultDirName={localappdata}\Programs\AI Text Detector
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=AI-Text-Detector-{#AppVersion}-Windows-Setup
SetupIconFile=build\icon.ico
UninstallDisplayIcon={app}\AI Text Detector.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "..\dist\AI Text Detector\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\AI Text Detector.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\AI Text Detector.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\AI Text Detector.exe"; Description: "Start {#AppName}"; Flags: nowait postinstall skipifsilent
