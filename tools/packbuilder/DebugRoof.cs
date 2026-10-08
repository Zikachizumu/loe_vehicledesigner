using SharpDX;

namespace LoeVdPack;

// vdpack debugroof <yft klasörü> <model>: tavan bölgesindeki üçgenlerin kemik/shader/görünürlük dökümü
static class DebugRoof
{
    public static int Run(string yftDir, string model)
    {
        var m = VehicleMesh.Load(yftDir, model, true);
        var bvh = new Bvh(m.P, m.Tris);
        float zTop = m.BBMax.Z;
        var stats = new Dictionary<string, int[]>();
        // shader adını üçgen bazında bilmek için tekrar oku
        for (int ti = 0; ti < m.Tris.Count; ti++)
        {
            var t = m.Tris[ti];
            Vector3 a = m.P[t[0]], b = m.P[t[1]], c = m.P[t[2]];
            var cen = (a + b + c) / 3f;
            if (cen.Z < zTop - 0.25f || Math.Abs(cen.X) > 0.35f || Math.Abs(cen.Y) > 0.6f) continue;
            var fn = Vector3.Cross(b - a, c - a); if (fn.Length() < 1e-10f) continue; fn.Normalize();
            if (Vector3.Dot(fn, m.N[t[0]] + m.N[t[1]] + m.N[t[2]]) < 0) fn = -fn;
            bool open = !bvh.Occluded(cen + fn * 0.004f, fn, 6f, ti);
            var bone = m.Bones.Length > m.VBone[t[0]] ? m.Bones[m.VBone[t[0]]].Name : "?";
            var key = $"{(m.TriPaint[ti] ? "PAINT" : "other")} bone={bone} nz={(fn.Z > 0.7f ? "up" : "side")}";
            if (!stats.TryGetValue(key, out var s)) stats[key] = s = new int[2];
            s[open ? 0 : 1]++;
        }
        Console.WriteLine($"{model} zTop={zTop} shaders={string.Join(",", m.Shaders)}");
        foreach (var kv in stats.OrderBy(k => k.Key)) Console.WriteLine($"  {kv.Key,-50} açık={kv.Value[0]} kapalı={kv.Value[1]}");
        return 0;
    }
}
