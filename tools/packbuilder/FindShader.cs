using CodeWalker.GameFiles;

namespace LoeVdPack;

// Keşif: verilen gölgelendiriciyi kullanan bir vanilla ydr bul ve XML'ini çıkar.
static class FindShader
{
    public static void Run(Game game, string shader, string outDir, int max = 6000)
    {
        uint h = JenkHash.GenHash(shader);
        int n = 0, found = 0;
        Directory.CreateDirectory(outDir);
        foreach (var e in game.FindByExt(".ydr"))
        {
            if (++n > max) break;
            YdrFile ydr;
            try { ydr = game.Load<YdrFile>(e); } catch { continue; }
            var d = ydr?.Drawable;
            var models = d?.DrawableModels?.High;
            if (models == null) continue;
            foreach (var m in models)
                foreach (var g in m.Geometries)
                {
                    if (g.Shader?.Name.Hash != h) continue;
                    found++;
                    Console.WriteLine($"{e.Path}  geomv={g.VerticesCount} comps={g.VertexData?.Info?.Flags} types={g.VertexData?.Info?.Types} skin={m.HasSkin}");
                    if (found == 1)
                    {
                        var xml = YdrXml.GetXml(ydr, outDir);
                        File.WriteAllText(Path.Combine(outDir, e.NameLower + ".xml"), xml);
                        Console.WriteLine("  xml -> " + Path.Combine(outDir, e.NameLower + ".xml"));
                    }
                    if (found >= 5) return;
                    goto next;
                }
            next:;
        }
        Console.WriteLine($"taranan {n}, bulunan {found}");
    }
}
