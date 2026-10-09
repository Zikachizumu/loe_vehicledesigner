using CodeWalker.GameFiles;

namespace LoeVdPack;

// vdpack meta2xml <girdi.ymt> <çıktı.xml>   — PSO/RBF meta dosyasını CodeWalker ile XML'e çevirir (carcols.ymt vb.)
static class Meta2Xml
{
    public static int Run(string[] args)
    {
        var data = File.ReadAllBytes(args[1]);
        var e = new RpfBinaryFileEntry { Name = Path.GetFileName(args[2]).Replace(".xml", "") };
        var ymt = new YmtFile(e);
        ymt.Load(data, e);
        var xml = MetaXml.GetXml(ymt, out _);
        File.WriteAllText(args[2], xml);
        Console.WriteLine("yazıldı: " + args[2] + " (" + xml.Length + " karakter)");
        return 0;
    }
}
