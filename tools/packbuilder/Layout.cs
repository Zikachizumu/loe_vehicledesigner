using SharpDX;

namespace LoeVdPack;

// shared/layout.lua ile birebir aynı kutu izdüşümlü tuval yerleşimi.
class Chart
{
    public string Id;
    public double X, Y, W, H, S;
    public string UAxis, VAxis;
    public int USign, VSign;
    public double UOrigin, VOrigin;
    public int[] N;     // dış normal (yerel)
    public int[] Side;  // tuval +x yönü (yerel)

    static double Comp(Vector3 p, string axis) => axis == "x" ? p.X : axis == "y" ? p.Y : p.Z;

    public (double x, double y) Project(Vector3 p) =>
        (X + USign * (Comp(p, UAxis) - UOrigin) * S, Y + VSign * (Comp(p, VAxis) - VOrigin) * S);

    public object ToJson() => new
    {
        id = Id,
        rect = new[] { X, Y, W, H },
        s = S,
        u = new { axis = UAxis, sign = USign, origin = UOrigin },
        v = new { axis = VAxis, sign = VSign, origin = VOrigin },
        n = N,
        side = Side,
    };
}

static class Layout
{
    public static List<Chart> Compute(Vector3 mn, Vector3 mx, int size)
    {
        int pad = size / 85;
        double L = Math.Max(0.5, mx.Y - mn.Y), W = Math.Max(0.3, mx.X - mn.X), H = Math.Max(0.3, mx.Z - mn.Z);
        double availW = size - 2 * pad, availH = size - 2 * pad;
        double s = Math.Min(availW / L, Math.Min((availW - pad) / (2 * W), (availH - 3 * pad) / (W + 3 * H)));
        s = Math.Floor(s * 1000) / 1000;
        double contentH = (W + 3 * H) * s + 3 * pad;
        double y0 = pad + (availH - contentH) / 2;
        double Cx(double w) => Math.Floor(pad + (availW - w) / 2);
        double Ls = L * s, Ws = W * s, Hs = H * s;
        double rowTop = Math.Floor(y0), rowLeft = Math.Floor(rowTop + Ws + pad), rowRight = Math.Floor(rowLeft + Hs + pad), rowEnds = Math.Floor(rowRight + Hs + pad);
        double endsX = Cx(2 * Ws + pad);
        Chart C(string id, double x, double y, double w, double h, string ua, int us, double uo, string va, int vs, double vo, int[] n, int[] side) =>
            new Chart { Id = id, X = x, Y = y, W = w, H = h, S = s, UAxis = ua, USign = us, UOrigin = uo, VAxis = va, VSign = vs, VOrigin = vo, N = n, Side = side };
        return new List<Chart>
        {
            C("top",   Cx(Ls), rowTop,   Ls, Ws, "y",  1, mn.Y, "x",  1, mn.X, new[] { 0, 0, 1 },  new[] { 0, 1, 0 }),
            C("left",  Cx(Ls), rowLeft,  Ls, Hs, "y", -1, mx.Y, "z", -1, mx.Z, new[] { -1, 0, 0 }, new[] { 0, -1, 0 }),
            C("right", Cx(Ls), rowRight, Ls, Hs, "y",  1, mn.Y, "z", -1, mx.Z, new[] { 1, 0, 0 },  new[] { 0, 1, 0 }),
            C("front", endsX,  rowEnds,  Ws, Hs, "x", -1, mx.X, "z", -1, mx.Z, new[] { 0, 1, 0 },  new[] { -1, 0, 0 }),
            C("rear",  endsX + Ws + pad, rowEnds, Ws, Hs, "x", 1, mn.X, "z", -1, mx.Z, new[] { 0, -1, 0 }, new[] { 1, 0, 0 }),
        };
    }

    // shared/layout.lua VD.Layout.chartForNormal ile aynı kural
    public static Chart ForNormal(List<Chart> charts, Vector3 n)
    {
        float ax = Math.Abs(n.X), ay = Math.Abs(n.Y), az = Math.Abs(n.Z);
        string id;
        if (n.Z > 0 && az >= ax && az >= ay) id = "top";
        else if (ax >= ay) id = n.X < 0 ? "left" : "right";
        else id = n.Y > 0 ? "front" : "rear";
        return charts.First(c => c.Id == id);
    }
}
