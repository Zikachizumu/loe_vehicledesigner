using CodeWalker.GameFiles;
using System.Text;

namespace LoeVdPack;

// Keşif: bir aracın yft yapısını yazdırır (geliştirme amaçlı).
static class Probe
{
    static string Comps(DrawableGeometry g)
    {
        var info = g.VertexData?.Info;
        if (info == null) return "";
        var parts = new List<string>();
        for (int k = 0; k < 16; k++)
            if (((info.Flags >> k) & 1) == 1) parts.Add(((VertexSemantics)k) + ":" + info.GetComponentType(k));
        return string.Join(",", parts);
    }

    public static void Run(Game game, string model)
    {
        foreach (var name in new[] { model + ".yft", model + "_hi.yft" })
        {
            var entries = game.Find(name);
            Console.WriteLine($"== {name}: {entries.Count} kayıt");
            foreach (var e in entries) Console.WriteLine("   " + e.Path);
            if (entries.Count == 0) continue;
            var yft = game.Load<YftFile>(entries[^1]);
            var frag = yft.Fragment;
            var d = frag.Drawable;
            var bones = d.Skeleton?.Bones?.Items ?? Array.Empty<Bone>();
            Console.WriteLine($"   bones={bones.Length}");
            for (int i = 0; i < bones.Length; i++)
            {
                var b = bones[i];
                Console.WriteLine($"     [{i}] {b.Name} tag={b.Tag} parent={b.ParentIndex} T={b.Translation} R={b.Rotation}");
            }
            var models = d.DrawableModels?.High ?? Array.Empty<DrawableModel>();
            Console.WriteLine($"   high models={models.Length}");
            for (int mi = 0; mi < models.Length; mi++)
            {
                var m = models[mi];
                var sb = new StringBuilder();
                foreach (var g in m.Geometries)
                {
                    var sh = g.Shader;
                    string shn = sh != null ? JenkIndex.TryGetString(sh.Name) ?? sh.Name.ToString() : "?";
                    sb.Append($"\n        geom v={g.VerticesCount} i={g.IndicesCount} vt={g.VertexData?.VertexType} decl={g.VertexData?.Info?.Types} flags={g.VertexData?.Info?.Flags} comps={Comps(g)} shader={shn}");
                }
                Console.WriteLine($"     model[{mi}] bone={m.BoneIndex} skin={m.HasSkin} geoms={m.Geometries.Length}{sb}");
            }
            Console.WriteLine($"   bbox min={d.BoundingBoxMin} max={d.BoundingBoxMax}");
            var children = frag.PhysicsLODGroup?.PhysicsLOD1?.Children?.data_items;
            Console.WriteLine($"   phys children={children?.Length ?? 0}");
            if (children != null)
                foreach (var c in children)
                {
                    var c1 = c.Drawable1?.DrawableModels?.High?.Length ?? 0;
                    var c2 = c.Drawable2?.DrawableModels?.High?.Length ?? 0;
                    if (c1 + c2 > 0) Console.WriteLine($"     child bone={c.BoneTag} d1models={c1} d2models={c2}");
                }
        }
    }
}
