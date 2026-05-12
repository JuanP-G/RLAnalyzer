Set ws  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir     = fso.GetParentFolderName(WScript.ScriptFullName)
' El 0 oculta la ventana de consola; False = no esperar a que termine
ws.Run "cmd /c """ & dir & "\start-app.bat""", 0, False
