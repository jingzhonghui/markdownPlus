!include LogicLib.nsh
!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER
Var AssociateMdxCheckbox
Var AssociateMdCheckbox
Var FileContextCheckbox
Var FolderContextCheckbox
Var AssociateMdxState
Var AssociateMdState
Var FileContextState
Var FolderContextState
!endif

!define MP_OPTIONS_KEY "Software\MarkdownPlus\Installer"
!define MP_MDX_EXT "Software\Classes\.mdx"
!define MP_MD_EXT "Software\Classes\.md"
!define MP_MDX_PROGID "Software\Classes\MarkdownPlus.mdx"
!define MP_MD_PROGID "Software\Classes\MarkdownPlus.md"
!define MP_MDX_MENU "Software\Classes\SystemFileAssociations\.mdx\shell\MarkdownPlusOpen"
!define MP_MD_MENU "Software\Classes\SystemFileAssociations\.md\shell\MarkdownPlusOpen"
!define MP_FOLDER_MENU "Software\Classes\Directory\shell\MarkdownPlusOpenFolder"

!ifndef BUILD_UNINSTALLER
Function MarkdownPlusLoadOptions
  StrCpy $AssociateMdxState 1
  StrCpy $AssociateMdState 0
  StrCpy $FileContextState 1
  StrCpy $FolderContextState 0
  ClearErrors
  ReadRegDWORD $0 HKCU ${MP_OPTIONS_KEY} AssociateMdx
  ${IfNot} ${Errors}
    StrCpy $AssociateMdxState $0
  ${EndIf}
  ClearErrors
  ReadRegDWORD $0 HKCU ${MP_OPTIONS_KEY} AssociateMd
  ${IfNot} ${Errors}
    StrCpy $AssociateMdState $0
  ${EndIf}
  ClearErrors
  ReadRegDWORD $0 HKCU ${MP_OPTIONS_KEY} FileContextMenu
  ${IfNot} ${Errors}
    StrCpy $FileContextState $0
  ${EndIf}
  ClearErrors
  ReadRegDWORD $0 HKCU ${MP_OPTIONS_KEY} FolderContextMenu
  ${IfNot} ${Errors}
    StrCpy $FolderContextState $0
  ${EndIf}
FunctionEnd

Function MarkdownPlusOptionsCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "文件关联"
  Pop $0
  ${NSD_CreateCheckbox} 8u 18u 100% 12u "关联 .mdx 文件"
  Pop $AssociateMdxCheckbox
  ${NSD_CreateCheckbox} 8u 34u 100% 12u "关联 .md 文件"
  Pop $AssociateMdCheckbox
  ${NSD_CreateLabel} 0 56u 100% 12u "资源管理器右键菜单"
  Pop $0
  ${NSD_CreateCheckbox} 8u 74u 100% 12u "在 .mdx 和 .md 文件右键菜单中添加“使用 Markdown+ 打开”"
  Pop $FileContextCheckbox
  ${NSD_CreateCheckbox} 8u 90u 100% 12u "在文件夹右键菜单中添加“使用 Markdown+ 打开文件夹”"
  Pop $FolderContextCheckbox

  ${If} $AssociateMdxState == 1
    ${NSD_Check} $AssociateMdxCheckbox
  ${EndIf}
  ${If} $AssociateMdState == 1
    ${NSD_Check} $AssociateMdCheckbox
  ${EndIf}
  ${If} $FileContextState == 1
    ${NSD_Check} $FileContextCheckbox
  ${EndIf}
  ${If} $FolderContextState == 1
    ${NSD_Check} $FolderContextCheckbox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function MarkdownPlusOptionsLeave
  ${NSD_GetState} $AssociateMdxCheckbox $AssociateMdxState
  ${NSD_GetState} $AssociateMdCheckbox $AssociateMdState
  ${NSD_GetState} $FileContextCheckbox $FileContextState
  ${NSD_GetState} $FolderContextCheckbox $FolderContextState
  WriteRegDWORD HKCU ${MP_OPTIONS_KEY} AssociateMdx $AssociateMdxState
  WriteRegDWORD HKCU ${MP_OPTIONS_KEY} AssociateMd $AssociateMdState
  WriteRegDWORD HKCU ${MP_OPTIONS_KEY} FileContextMenu $FileContextState
  WriteRegDWORD HKCU ${MP_OPTIONS_KEY} FolderContextMenu $FolderContextState
FunctionEnd
!endif

!macro MarkdownPlusWriteFileAssociation extension progid description
  WriteRegStr HKCU "Software\Classes\${extension}" "" "${progid}"
  WriteRegStr HKCU "Software\Classes\${progid}" "" "${description}"
  WriteRegStr HKCU "Software\Classes\${progid}\DefaultIcon" "" "$appExe,0"
  WriteRegStr HKCU "Software\Classes\${progid}\shell\open\command" "" '"$appExe" "%1"'
!macroend

!macro MarkdownPlusRemoveFileAssociation extension progid
  ReadRegStr $0 HKCU "Software\Classes\${extension}" ""
  ${If} $0 == "${progid}"
    DeleteRegValue HKCU "Software\Classes\${extension}" ""
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\${progid}"
!macroend

!macro MarkdownPlusRestoreFileAssociation extension progid backupName
  ReadRegStr $0 HKCU "Software\Classes\${extension}" ""
  ${If} $0 == "${progid}"
    ReadRegStr $1 HKCU ${MP_OPTIONS_KEY} ${backupName}
    ${If} $1 == ""
      DeleteRegValue HKCU "Software\Classes\${extension}" ""
    ${Else}
      WriteRegStr HKCU "Software\Classes\${extension}" "" $1
    ${EndIf}
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\${progid}"
!macroend

!macro MarkdownPlusWriteFileMenu extension
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${extension}\shell\MarkdownPlusOpen" "MUIVerb" "使用 Markdown+ 打开"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${extension}\shell\MarkdownPlusOpen" "Icon" "$appExe"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${extension}\shell\MarkdownPlusOpen\command" "" '"$appExe" "%1"'
!macroend

!macro MarkdownPlusRemoveFileMenu extension
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${extension}\shell\MarkdownPlusOpen"
!macroend

!ifndef BUILD_UNINSTALLER
!macro customInit
  Call MarkdownPlusLoadOptions
!macroend

!macro customPageAfterChangeDir
  Page custom MarkdownPlusOptionsCreate MarkdownPlusOptionsLeave
!macroend
!endif

!macro customInstall
  WriteRegDWORD HKCU ${MP_OPTIONS_KEY} AssociateMdx $AssociateMdxState
  WriteRegDWORD HKCU ${MP_OPTIONS_KEY} AssociateMd $AssociateMdState
  WriteRegDWORD HKCU ${MP_OPTIONS_KEY} FileContextMenu $FileContextState
  WriteRegDWORD HKCU ${MP_OPTIONS_KEY} FolderContextMenu $FolderContextState
  StrCpy $0 0
  ReadRegDWORD $0 HKCU ${MP_OPTIONS_KEY} PreviousMdxCaptured
  ${If} $0 != 1
    ReadRegStr $0 HKCU ${MP_MDX_EXT} ""
    WriteRegStr HKCU ${MP_OPTIONS_KEY} PreviousMdxAssociation $0
    WriteRegDWORD HKCU ${MP_OPTIONS_KEY} PreviousMdxCaptured 1
  ${EndIf}
  StrCpy $0 0
  ReadRegDWORD $0 HKCU ${MP_OPTIONS_KEY} PreviousMdCaptured
  ${If} $0 != 1
    ReadRegStr $0 HKCU ${MP_MD_EXT} ""
    WriteRegStr HKCU ${MP_OPTIONS_KEY} PreviousMdAssociation $0
    WriteRegDWORD HKCU ${MP_OPTIONS_KEY} PreviousMdCaptured 1
  ${EndIf}

  ${If} $AssociateMdxState == 1
    !insertmacro MarkdownPlusWriteFileAssociation ".mdx" "MarkdownPlus.mdx" "Markdown+ document"
  ${Else}
    !insertmacro MarkdownPlusRestoreFileAssociation ".mdx" "MarkdownPlus.mdx" PreviousMdxAssociation
  ${EndIf}
  ${If} $AssociateMdState == 1
    !insertmacro MarkdownPlusWriteFileAssociation ".md" "MarkdownPlus.md" "Markdown document"
  ${Else}
    !insertmacro MarkdownPlusRestoreFileAssociation ".md" "MarkdownPlus.md" PreviousMdAssociation
  ${EndIf}
  ${If} $FileContextState == 1
    !insertmacro MarkdownPlusWriteFileMenu ".mdx"
    !insertmacro MarkdownPlusWriteFileMenu ".md"
  ${Else}
    !insertmacro MarkdownPlusRemoveFileMenu ".mdx"
    !insertmacro MarkdownPlusRemoveFileMenu ".md"
  ${EndIf}
  ${If} $FolderContextState == 1
    WriteRegStr HKCU ${MP_FOLDER_MENU} "MUIVerb" "使用 Markdown+ 打开文件夹"
    WriteRegStr HKCU ${MP_FOLDER_MENU} "Icon" "$appExe"
    WriteRegStr HKCU "${MP_FOLDER_MENU}\command" "" '"$appExe" "%1"'
  ${Else}
    DeleteRegKey HKCU ${MP_FOLDER_MENU}
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i, i, p, p)' 0x08000000 0 0 0
!macroend

!macro customUnInstall
  !insertmacro MarkdownPlusRestoreFileAssociation ".mdx" "MarkdownPlus.mdx" PreviousMdxAssociation
  !insertmacro MarkdownPlusRestoreFileAssociation ".md" "MarkdownPlus.md" PreviousMdAssociation
  !insertmacro MarkdownPlusRemoveFileMenu ".mdx"
  !insertmacro MarkdownPlusRemoveFileMenu ".md"
  DeleteRegKey HKCU ${MP_FOLDER_MENU}
  DeleteRegKey HKCU ${MP_OPTIONS_KEY}
  System::Call 'shell32::SHChangeNotify(i, i, p, p)' 0x08000000 0 0 0
!macroend
