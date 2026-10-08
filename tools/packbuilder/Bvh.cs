using SharpDX;

namespace LoeVdPack;

// Üçgenler için basit BVH; "bu yüzey dışarıdan görünür mü" ışın testinde kullanılır.
class Bvh
{
    struct Node { public Vector3 Min, Max; public int Left, Right, Start, Count; }

    readonly List<Vector3> P;
    readonly List<int[]> Tris;
    readonly int[] order;
    readonly Vector3[] cen;
    readonly List<Node> nodes = new();

    public Bvh(List<Vector3> p, List<int[]> tris)
    {
        P = p;
        Tris = tris;
        order = Enumerable.Range(0, tris.Count).ToArray();
        cen = tris.Select(t => (p[t[0]] + p[t[1]] + p[t[2]]) / 3f).ToArray();
        Build(0, tris.Count);
    }

    int Build(int start, int count)
    {
        var mn = new Vector3(float.MaxValue);
        var mx = new Vector3(float.MinValue);
        for (int i = start; i < start + count; i++)
        {
            var t = Tris[order[i]];
            for (int k = 0; k < 3; k++) { mn = Vector3.Min(mn, P[t[k]]); mx = Vector3.Max(mx, P[t[k]]); }
        }
        int idx = nodes.Count;
        nodes.Add(new Node { Min = mn, Max = mx, Left = -1, Right = -1, Start = start, Count = count });
        if (count <= 6) return idx;
        var ext = mx - mn;
        int axis = ext.X > ext.Y ? (ext.X > ext.Z ? 0 : 2) : (ext.Y > ext.Z ? 1 : 2);
        Array.Sort(order, start, count, Comparer<int>.Create((a, b) => cen[a][axis].CompareTo(cen[b][axis])));
        int half = count / 2;
        int l = Build(start, half);
        int r = Build(start + half, count - half);
        var n = nodes[idx];
        n.Left = l; n.Right = r; n.Count = 0;
        nodes[idx] = n;
        return idx;
    }

    static bool RayBox(Vector3 o, Vector3 inv, Vector3 mn, Vector3 mx, float tmax)
    {
        float t1 = (mn.X - o.X) * inv.X, t2 = (mx.X - o.X) * inv.X;
        float tmin = Math.Min(t1, t2), tmx = Math.Max(t1, t2);
        t1 = (mn.Y - o.Y) * inv.Y; t2 = (mx.Y - o.Y) * inv.Y;
        tmin = Math.Max(tmin, Math.Min(t1, t2)); tmx = Math.Min(tmx, Math.Max(t1, t2));
        t1 = (mn.Z - o.Z) * inv.Z; t2 = (mx.Z - o.Z) * inv.Z;
        tmin = Math.Max(tmin, Math.Min(t1, t2)); tmx = Math.Min(tmx, Math.Max(t1, t2));
        return tmx >= Math.Max(tmin, 0) && tmin <= tmax;
    }

    bool RayTri(Vector3 o, Vector3 d, int[] t, float tmax, out float dist)
    {
        dist = 0;
        var a = P[t[0]]; var e1 = P[t[1]] - a; var e2 = P[t[2]] - a;
        var h = Vector3.Cross(d, e2);
        float det = Vector3.Dot(e1, h);
        if (Math.Abs(det) < 1e-9f) return false;
        float f = 1f / det;
        var s = o - a;
        float u = f * Vector3.Dot(s, h);
        if (u < 0 || u > 1) return false;
        var q = Vector3.Cross(s, e1);
        float v = f * Vector3.Dot(d, q);
        if (v < 0 || u + v > 1) return false;
        dist = f * Vector3.Dot(e2, q);
        return dist > 1e-5f && dist < tmax;
    }

    // ignore: kaynak üçgen (kendine çarpmasın)
    public bool Occluded(Vector3 o, Vector3 d, float tmax, int ignore)
    {
        var inv = new Vector3(1f / (Math.Abs(d.X) < 1e-12f ? 1e-12f : d.X), 1f / (Math.Abs(d.Y) < 1e-12f ? 1e-12f : d.Y), 1f / (Math.Abs(d.Z) < 1e-12f ? 1e-12f : d.Z));
        var stack = new Stack<int>();
        stack.Push(0);
        while (stack.Count > 0)
        {
            var n = nodes[stack.Pop()];
            if (!RayBox(o, inv, n.Min, n.Max, tmax)) continue;
            if (n.Left < 0)
            {
                for (int i = n.Start; i < n.Start + n.Count; i++)
                {
                    int ti = order[i];
                    if (ti == ignore) continue;
                    if (RayTri(o, d, Tris[ti], tmax, out _)) return true;
                }
            }
            else { stack.Push(n.Left); stack.Push(n.Right); }
        }
        return false;
    }
}
