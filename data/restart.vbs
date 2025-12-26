Set WshShell = CreateObject("WScript.Shell")
WScript.Sleep 2000
WshShell.CurrentDirectory = "C:\\bartenderbot\\bot-v2"
WshShell.Run "cmd /c npm start", 1, False