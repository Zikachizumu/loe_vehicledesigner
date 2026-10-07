using LoeVdPack;

if (args.Length < 2)
{
    Console.WriteLine("kullanım: vdpack probe <gta klasörü> <model>");
    return 1;
}
var game = new Game(args[1]);
switch (args[0])
{
    case "probe":
        foreach (var m in args.Skip(2)) Probe.Run(game, m);
        break;
    case "findshader":
        FindShader.Run(game, args[2], args.Length > 3 ? args[3] : "out/probe");
        break;
}
return 0;
