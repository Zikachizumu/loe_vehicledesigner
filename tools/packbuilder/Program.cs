using LoeVdPack;

// vdpack — loe_vehicledesigner yüzey paketi üreticisi
//   build  --yft <dir> --out <dir> --name <paket> --models a,b [--slots 4] [--offset 0.004] [--size 4096] [--lod 150] [--preview]
//   verify <paket klasörü>
//   probe / findshader / ytyp <GTA klasörü> ...   (geliştirme; yalnızca Windows'ta GTA arşivleriyle)
if (args.Length < 1)
{
    Console.WriteLine("kullanım: vdpack build|verify|probe|findshader|ytyp ...");
    return 1;
}
try
{
    switch (args[0])
    {
        case "build":
            return Build.Run(args);
        case "debugroof":
            return DebugRoof.Run(args[1], args[2]);
        case "verify":
            return Verify.Run(args[1]);
        case "probe":
        {
            var game = new Game(args[1]);
            foreach (var m in args.Skip(2)) Probe.Run(game, m);
            return 0;
        }
        case "findshader":
            FindShader.Run(new Game(args[1]), args[2], args.Length > 3 ? args[3] : "out/probe");
            return 0;
        case "ytyp":
            ProbeYtyp.Run(new Game(args[1]), args[2], args.Length > 3 ? args[3] : "out/probe");
            return 0;
    }
}
catch (Exception ex)
{
    Console.WriteLine("HATA: " + ex);
    return 9;
}
Console.WriteLine("bilinmeyen komut: " + args[0]);
return 1;
