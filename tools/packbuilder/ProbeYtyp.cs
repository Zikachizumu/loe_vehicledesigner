using CodeWalker.GameFiles;

namespace LoeVdPack;

// Keşif: küçük bir vanilla ytyp'yi XML olarak yazdır (biçim referansı).
static class ProbeYtyp
{
    public static void Run(Game game, string name, string outDir)
    {
        Directory.CreateDirectory(outDir);
        var e = game.Best(name);
        if (e == null) { Console.WriteLine("yok: " + name); return; }
        var data = e.File.ExtractFile(e);
        var xml = MetaXml.GetXml(e, data, out var fn, outDir);
        File.WriteAllText(Path.Combine(outDir, name + ".xml"), xml);
        Console.WriteLine(e.Path + " -> " + Path.Combine(outDir, name + ".xml") + " (" + xml.Length + ")");
    }
}
