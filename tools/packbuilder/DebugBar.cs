using SharpDX;

namespace LoeVdPack;

// vdpack debugbar <yft klasörü> <model>: siren kemikleri ve çevresindeki üçgenlerin dökümü
static class DebugBar
{
    public static int Run(string yftDir, string model)
    {
        var m = VehicleMesh.Load(yftDir, model, true);
        var sirens = new List<(string name, Vector3 p)>();
        for (int i = 0; i < m.Bones.Length; i++)
        {
            var n = m.Bones[i].Name ?? "";
            if (n.StartsWith("siren")) sirens.Add((n, m.Abs[i].TranslationVector));
        }
        Console.WriteLine($"{model} bbmax.z={m.BBMax.Z:0.###} siren kemikleri:");
        foreach (var s in sirens.OrderBy(s => s.name)) Console.WriteLine($"   {s.name,-12} {s.p.X,7:0.###} {s.p.Y,7:0.###} {s.p.Z,7:0.###}");
        var stats = new Dictionary<string, int>();
        var roof = sirens.Where(s => s.p.Z > m.BBMax.Z - 0.4f).ToList();
        if (roof.Count == 0) { Console.WriteLine("  tavan sireni yok"); return 0; }
        var mn = new Vector3(roof.Min(s => s.p.X) - 0.15f, roof.Min(s => s.p.Y) - 0.15f, roof.Min(s => s.p.Z) - 0.12f);
        var mx = new Vector3(roof.Max(s => s.p.X) + 0.15f, roof.Max(s => s.p.Y) + 0.15f, roof.Max(s => s.p.Z) + 0.15f);
        Console.WriteLine($"  kutu {mn} - {mx}");
        for (int ti = 0; ti < m.Tris.Count; ti++)
        {
            var t = m.Tris[ti];
            var c = (m.P[t[0]] + m.P[t[1]] + m.P[t[2]]) / 3f;
            if (c.X < mn.X || c.X > mx.X || c.Y < mn.Y || c.Y > mx.Y || c.Z < mn.Z || c.Z > mx.Z) continue;
            var bone = m.Bones.Length > m.VBone[t[0]] ? m.Bones[m.VBone[t[0]]].Name : "?";
            var key = $"shader={m.TriShader[ti]} bone={(bone.StartsWith("siren") ? "siren*" : bone)}";
            stats[key] = stats.GetValueOrDefault(key) + 1;
        }
        foreach (var kv in stats.OrderBy(k => k.Key)) Console.WriteLine($"   {kv.Key,-60} {kv.Value}");
        return 0;
    }
}
