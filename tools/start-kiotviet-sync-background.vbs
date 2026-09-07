Option Explicit

Dim shell, folder, command
Set shell = CreateObject("WScript.Shell")
folder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = Chr(34) & folder & "\start-kiotviet-sync.cmd" & Chr(34)
shell.Run command, 0, False
