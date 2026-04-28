; NSIS installer hooks for BoltMD

!macro NSIS_HOOK_POSTINSTALL
  ; Overwrite DefaultIcon for each registered Markdown extension so that
  ; .md files show the custom md.ico instead of the application icon.
  WriteRegStr SHCTX "Software\Classes\md\DefaultIcon" "" "$INSTDIR\icons\md.ico"
  WriteRegStr SHCTX "Software\Classes\markdown\DefaultIcon" "" "$INSTDIR\icons\md.ico"
  WriteRegStr SHCTX "Software\Classes\mdown\DefaultIcon" "" "$INSTDIR\icons\md.ico"
  WriteRegStr SHCTX "Software\Classes\mkd\DefaultIcon" "" "$INSTDIR\icons\md.ico"
  WriteRegStr SHCTX "Software\Classes\mkdn\DefaultIcon" "" "$INSTDIR\icons\md.ico"

  ; Notify the shell so Explorer picks up the new icon immediately.
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"

  ; Drop sentinel files so the app knows it was (re)installed and should
  ; reset the session / re-show the welcome page on next launch.
  ; We write to BOTH the install dir and %APPDATA% to cover all cases.
  FileOpen $0 "$INSTDIR\.installed" w
  FileWrite $0 "1"
  FileClose $0
  CreateDirectory "$APPDATA\${BUNDLEID}"
  FileOpen $0 "$APPDATA\${BUNDLEID}\.installed" w
  FileWrite $0 "1"
  FileClose $0
!macroend
