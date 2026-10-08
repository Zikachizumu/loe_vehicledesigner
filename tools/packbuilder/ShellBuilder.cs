using SharpDX;

namespace LoeVdPack;

class ShellVertex
{
    public Vector3 P;      // kemik yerel uzayında
    public Vector3 N;
    public Vector2 UV;
    public Vector4 T;      // teğet (kemik yerel), w = yön
}

class ShellPart
{
    public string Bone;
    public int BoneIndex;
    public List<ShellVertex> V = new();
    public List<int> I = new();
    public Vector3 Min = new(float.MaxValue), Max = new(float.MinValue);
}

class ShellResult
{
    public List<ShellPart> Parts = new();
    public List<Chart> Charts;
    public int PaintTris, KeptTris;
    public List<(Vector3 a, Vector3 b, Vector3 c, Vector2 ua, Vector2 ub, Vector2 uc)> UvTris = new(); // şablon/önizleme (araç uzayı)
}

// Boya geometrisinden dışarıdan görünen üçgenleri seçer, kutu izdüşümüyle UV verir ve kemik başına parçalara böler.
static class ShellBuilder
{
    public static ShellResult Build(VehicleMesh m, int size, float offset)
    {
        var res = new ShellResult { Charts = Layout.Compute(m.BBMin, m.BBMax, size) };
        var bvh = new Bvh(m.P, m.Tris);
        var parts = new Dictionary<int, ShellPart>();
        var maps = new Dictionary<int, Dictionary<long, int>>();

        for (int ti = 0; ti < m.Tris.Count; ti++)
        {
            if (!m.TriPaint[ti]) continue;
            res.PaintTris++;
            var t = m.Tris[ti];
            Vector3 a = m.P[t[0]], b = m.P[t[1]], c = m.P[t[2]];
            var fn = Vector3.Cross(b - a, c - a);
            float area2 = fn.Length();
            if (area2 < 1e-10f) continue;
            fn /= area2;
            var avgN = m.N[t[0]] + m.N[t[1]] + m.N[t[2]];
            if (Vector3.Dot(fn, avgN) < 0) fn = -fn;

            // dış yüzey testi: normal yönünde ve çevresinde 5 ışın; en az 2'si açık alana çıkmalı
            var cen = (a + b + c) / 3f;
            var o = cen + fn * 0.004f;
            var t1 = Math.Abs(fn.Z) < 0.9f ? Vector3.Normalize(Vector3.Cross(fn, Vector3.UnitZ)) : Vector3.Normalize(Vector3.Cross(fn, Vector3.UnitX));
            var t2 = Vector3.Cross(fn, t1);
            var dirs = new[] { fn, Vector3.Normalize(fn + t1 * 0.6f), Vector3.Normalize(fn - t1 * 0.6f), Vector3.Normalize(fn + t2 * 0.6f), Vector3.Normalize(fn - t2 * 0.6f) };
            int open = 0;
            foreach (var d in dirs) if (!bvh.Occluded(o, d, 6f, ti)) open++;
            if (open < 2) continue;
            res.KeptTris++;

            var chart = Layout.ForNormal(res.Charts, fn);
            int chartIdx = res.Charts.IndexOf(chart);

            // parça: köşelerin çoğunluk kemiği
            int bone = m.VBone[t[0]];
            if (m.VBone[t[1]] == m.VBone[t[2]]) bone = m.VBone[t[1]];
            // silah/taret parçaları kaplanmaz. misc_* (ör. tavan gibi mod'lanabilir gövde parçaları) ve extra_* dahil;
            // extra_N parçası oyunda o ekstra kapalıyken gizlenir (client/backends.lua).
            var bname = (m.Bones.Length > bone ? m.Bones[bone].Name : "") ?? "";
            if (bname.StartsWith("turret_") || bname.StartsWith("weapon_")) { res.KeptTris--; continue; }
            if (!parts.TryGetValue(bone, out var part))
            {
                part = new ShellPart { BoneIndex = bone, Bone = m.Bones.Length > bone ? m.Bones[bone].Name : "chassis" };
                parts[bone] = part;
                maps[bone] = new Dictionary<long, int>();
            }
            var map = maps[bone];
            var inv = m.InvAbs.Length > bone ? m.InvAbs[bone] : Matrix.Identity;
            var side = new Vector3(chart.Side[0], chart.Side[1], chart.Side[2]);
            var uvs = new Vector2[3];
            for (int k = 0; k < 3; k++)
            {
                int vi = t[k];
                var (px, py) = chart.Project(m.P[vi]);
                uvs[k] = new Vector2((float)(px / size), (float)(py / size));
                long key = ((long)vi << 3) | (long)chartIdx;
                if (!map.TryGetValue(key, out int ni))
                {
                    var pw = m.P[vi] + m.N[vi] * offset;
                    var pl = Vector3.TransformCoordinate(pw, inv);
                    var nl = Vector3.Normalize(Vector3.TransformNormal(m.N[vi], inv));
                    var tl = Vector3.Normalize(Vector3.TransformNormal(side, inv));
                    ni = part.V.Count;
                    part.V.Add(new ShellVertex { P = pl, N = nl, UV = uvs[k], T = new Vector4(tl, 1f) });
                    part.Min = Vector3.Min(part.Min, pl);
                    part.Max = Vector3.Max(part.Max, pl);
                    map[key] = ni;
                }
                part.I.Add(ni);
            }
            res.UvTris.Add((a, b, c, uvs[0], uvs[1], uvs[2]));
        }
        // çok küçük parçalar (birkaç üçgen) ayrı prop olmaya değmez
        res.Parts = parts.Values.Where(p => p.I.Count >= 3 * 12).OrderBy(p => p.BoneIndex).ToList();
        return res;
    }
}
