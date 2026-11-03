import Foundation

// A Swift port of the SGP4/SDP4 propagator from David Vallado's reference
// implementation ("Revisiting Spacetrack Report #3", AIAA 2006-6753),
// following the structure of the public-domain python-sgp4 port.
// Uses WGS72 constants and "improved" operation mode, matching CelesTrak.

public enum SGP4Error: Error, Equatable, Sendable {
    case meanMotionNotPositive
    case eccentricityOutOfRange
    case perturbedEccentricityOutOfRange
    case semiLatusRectumNegative
    case decayed
}

/// Position (km) and velocity (km/s) in the TEME frame.
public struct StateVector: Sendable, Hashable {
    public var position: Vector3
    public var velocity: Vector3
}

public final class SGP4: @unchecked Sendable {
    // Immutable after init; safe to share across threads.

    // WGS72 constants
    let radiusEarthKm = 6378.135
    let xke: Double
    let j2 = 0.001082616
    let j3 = -0.00000253881
    let j4 = -0.00000165597
    let j3oj2: Double

    public let elements: OrbitalElements
    /// Epoch in days since 1949 Dec 31 00:00 UT.
    let epoch: Double

    var bstar = 0.0, ecco = 0.0, argpo = 0.0, inclo = 0.0, mo = 0.0, noKozai = 0.0, nodeo = 0.0
    var noUnkozai = 0.0
    var isimp = false
    var isDeepSpace = false

    var aycof = 0.0, con41 = 0.0, cc1 = 0.0, cc4 = 0.0, cc5 = 0.0, d2 = 0.0, d3 = 0.0, d4 = 0.0
    var delmo = 0.0, eta = 0.0, argpdot = 0.0, omgcof = 0.0, sinmao = 0.0
    var t2cof = 0.0, t3cof = 0.0, t4cof = 0.0, t5cof = 0.0
    var x1mth2 = 0.0, x7thm1 = 0.0, mdot = 0.0, nodedot = 0.0, xlcof = 0.0, xmcof = 0.0, nodecf = 0.0

    // Deep space
    var irez = 0
    var d2201 = 0.0, d2211 = 0.0, d3210 = 0.0, d3222 = 0.0, d4410 = 0.0, d4422 = 0.0
    var d5220 = 0.0, d5232 = 0.0, d5421 = 0.0, d5433 = 0.0
    var dedt = 0.0, del1 = 0.0, del2 = 0.0, del3 = 0.0, didt = 0.0, dmdt = 0.0, dnodt = 0.0, domdt = 0.0
    var e3 = 0.0, ee2 = 0.0, peo = 0.0, pgho = 0.0, pho = 0.0, pinco = 0.0, plo = 0.0
    var se2 = 0.0, se3 = 0.0, sgh2 = 0.0, sgh3 = 0.0, sgh4 = 0.0, sh2 = 0.0, sh3 = 0.0
    var si2 = 0.0, si3 = 0.0, sl2 = 0.0, sl3 = 0.0, sl4 = 0.0, gsto = 0.0, xfact = 0.0
    var xgh2 = 0.0, xgh3 = 0.0, xgh4 = 0.0, xh2 = 0.0, xh3 = 0.0, xi2 = 0.0, xi3 = 0.0
    var xl2 = 0.0, xl3 = 0.0, xl4 = 0.0, xlamo = 0.0, zmol = 0.0, zmos = 0.0

    private static let twopi = 2.0 * Double.pi
    private static let x2o3 = 2.0 / 3.0

    public init(elements: OrbitalElements) throws {
        self.elements = elements
        let mu = 398600.8
        xke = 60.0 / (radiusEarthKm * radiusEarthKm * radiusEarthKm / mu).squareRoot()
        j3oj2 = j3 / j2

        let deg = Double.pi / 180
        epoch = elements.epochJD - 2433281.5
        bstar = elements.bstar
        ecco = elements.eccentricity
        argpo = elements.argumentOfPerigee * deg
        inclo = elements.inclination * deg
        mo = elements.meanAnomaly * deg
        noKozai = elements.meanMotion * SGP4.twopi / 1440.0
        nodeo = elements.raan * deg

        guard noKozai > 0, ecco >= 0, ecco < 1 else { throw SGP4Error.eccentricityOutOfRange }

        let ss = 78.0 / radiusEarthKm + 1.0
        let qzms2ttemp = (120.0 - 78.0) / radiusEarthKm
        let qzms2t = qzms2ttemp * qzms2ttemp * qzms2ttemp * qzms2ttemp
        let x2o3 = SGP4.x2o3
        let twopi = SGP4.twopi

        // ---- initl ----
        let eccsq = ecco * ecco
        let omeosq = 1.0 - eccsq
        let rteosq = omeosq.squareRoot()
        let cosio = cos(inclo)
        let cosio2 = cosio * cosio
        let ak = pow(xke / noKozai, x2o3)
        let d1 = 0.75 * j2 * (3.0 * cosio2 - 1.0) / (rteosq * omeosq)
        var del = d1 / (ak * ak)
        let adel = ak * (1.0 - del * del - del * (1.0 / 3.0 + 134.0 * del * del / 81.0))
        del = d1 / (adel * adel)
        noUnkozai = noKozai / (1.0 + del)
        let ao = pow(xke / noUnkozai, x2o3)
        let sinio = sin(inclo)
        let po = ao * omeosq
        let con42 = 1.0 - 5.0 * cosio2
        con41 = -con42 - cosio2 - cosio2
        let posq = po * po
        let rp = ao * (1.0 - ecco)
        gsto = JulianDate.gmst(epoch + 2433281.5)

        // ---- sgp4init body ----
        isimp = rp < 220.0 / radiusEarthKm + 1.0
        var sfour = ss
        var qzms24 = qzms2t
        let perige = (rp - 1.0) * radiusEarthKm
        if perige < 156.0 {
            sfour = perige - 78.0
            if perige < 98.0 { sfour = 20.0 }
            let qzms24temp = (120.0 - sfour) / radiusEarthKm
            qzms24 = qzms24temp * qzms24temp * qzms24temp * qzms24temp
            sfour = sfour / radiusEarthKm + 1.0
        }
        let pinvsq = 1.0 / posq
        let tsi = 1.0 / (ao - sfour)
        eta = ao * ecco * tsi
        let etasq = eta * eta
        let eeta = ecco * eta
        let psisq = abs(1.0 - etasq)
        let coef = qzms24 * pow(tsi, 4.0)
        let coef1 = coef / pow(psisq, 3.5)
        let cc2 = coef1 * noUnkozai * (ao * (1.0 + 1.5 * etasq + eeta * (4.0 + etasq))
            + 0.375 * j2 * tsi / psisq * con41 * (8.0 + 3.0 * etasq * (8.0 + etasq)))
        cc1 = bstar * cc2
        var cc3 = 0.0
        if ecco > 1.0e-4 {
            cc3 = -2.0 * coef * tsi * j3oj2 * noUnkozai * sinio / ecco
        }
        x1mth2 = 1.0 - cosio2
        cc4 = 2.0 * noUnkozai * coef1 * ao * omeosq
            * (eta * (2.0 + 0.5 * etasq) + ecco * (0.5 + 2.0 * etasq)
                - j2 * tsi / (ao * psisq)
                * (-3.0 * con41 * (1.0 - 2.0 * eeta + etasq * (1.5 - 0.5 * eeta))
                    + 0.75 * x1mth2 * (2.0 * etasq - eeta * (1.0 + etasq)) * cos(2.0 * argpo)))
        cc5 = 2.0 * coef1 * ao * omeosq * (1.0 + 2.75 * (etasq + eeta) + eeta * etasq)
        let cosio4 = cosio2 * cosio2
        let temp1 = 1.5 * j2 * pinvsq * noUnkozai
        let temp2 = 0.5 * temp1 * j2 * pinvsq
        let temp3 = -0.46875 * j4 * pinvsq * pinvsq * noUnkozai
        mdot = noUnkozai + 0.5 * temp1 * rteosq * con41
            + 0.0625 * temp2 * rteosq * (13.0 - 78.0 * cosio2 + 137.0 * cosio4)
        argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7.0 - 114.0 * cosio2 + 395.0 * cosio4)
            + temp3 * (3.0 - 36.0 * cosio2 + 49.0 * cosio4)
        let xhdot1 = -temp1 * cosio
        nodedot = xhdot1 + (0.5 * temp2 * (4.0 - 19.0 * cosio2) + 2.0 * temp3 * (3.0 - 7.0 * cosio2)) * cosio
        let xpidot = argpdot + nodedot
        omgcof = bstar * cc3 * cos(argpo)
        xmcof = 0.0
        if ecco > 1.0e-4 {
            xmcof = -x2o3 * coef * bstar / eeta
        }
        nodecf = 3.5 * omeosq * xhdot1 * cc1
        t2cof = 1.5 * cc1
        if abs(cosio + 1.0) > 1.5e-12 {
            xlcof = -0.25 * j3oj2 * sinio * (3.0 + 5.0 * cosio) / (1.0 + cosio)
        } else {
            xlcof = -0.25 * j3oj2 * sinio * (3.0 + 5.0 * cosio) / 1.5e-12
        }
        aycof = -0.5 * j3oj2 * sinio
        let delmotemp = 1.0 + eta * cos(mo)
        delmo = delmotemp * delmotemp * delmotemp
        sinmao = sin(mo)
        x7thm1 = 7.0 * cosio2 - 1.0

        // ---- deep space initialisation ----
        if twopi / noUnkozai >= 225.0 {
            isDeepSpace = true
            isimp = true
            let tc = 0.0
            let inclm = inclo

            // ---- dscom ----
            let zes = 0.01675, zel = 0.05490
            let c1ss = 2.9864797e-6, c1l = 4.7968065e-7
            let zsinis = 0.39785416, zcosis = 0.91744867
            let zcosgs = 0.1945905, zsings = -0.98088458

            let nm = noUnkozai
            let em = ecco
            let snodm = sin(nodeo), cnodm = cos(nodeo)
            let sinomm = sin(argpo), cosomm = cos(argpo)
            let sinim = sin(inclo), cosim = cos(inclo)
            let emsq = em * em
            let betasq = 1.0 - emsq
            let rtemsq = betasq.squareRoot()

            peo = 0; pinco = 0; plo = 0; pgho = 0; pho = 0
            let day = epoch + 18261.5 + tc / 1440.0
            let xnodce = fmod(4.5236020 - 9.2422029e-4 * day, twopi)
            let stem = sin(xnodce), ctem = cos(xnodce)
            let zcosil = 0.91375164 - 0.03568096 * ctem
            let zsinil = (1.0 - zcosil * zcosil).squareRoot()
            let zsinhl = 0.089683511 * stem / zsinil
            let zcoshl = (1.0 - zsinhl * zsinhl).squareRoot()
            let gam = 5.8351514 + 0.0019443680 * day
            var zx = 0.39785416 * stem / zsinil
            let zy = zcoshl * ctem + 0.91744867 * zsinhl * stem
            zx = atan2(zx, zy)
            zx = gam + zx - xnodce
            let zcosgl = cos(zx), zsingl = sin(zx)

            var zcosg = zcosgs, zsing = zsings, zcosi = zcosis, zsini = zsinis
            var zcosh = cnodm, zsinh = snodm
            var cc = c1ss
            let xnoi = 1.0 / nm

            var s1 = 0.0, s2 = 0.0, s3 = 0.0, s4 = 0.0, s5 = 0.0, s6 = 0.0, s7 = 0.0
            var ss1 = 0.0, ss2 = 0.0, ss3 = 0.0, ss4 = 0.0, ss5 = 0.0, ss6 = 0.0, ss7 = 0.0
            var z1 = 0.0, z2 = 0.0, z3 = 0.0, z11 = 0.0, z12 = 0.0, z13 = 0.0
            var z21 = 0.0, z22 = 0.0, z23 = 0.0, z31 = 0.0, z32 = 0.0, z33 = 0.0
            var sz1 = 0.0, sz2 = 0.0, sz3 = 0.0, sz11 = 0.0, sz12 = 0.0, sz13 = 0.0
            var sz21 = 0.0, sz22 = 0.0, sz23 = 0.0, sz31 = 0.0, sz32 = 0.0, sz33 = 0.0

            for lsflg in 1...2 {
                let a1 = zcosg * zcosh + zsing * zcosi * zsinh
                let a3 = -zsing * zcosh + zcosg * zcosi * zsinh
                let a7 = -zcosg * zsinh + zsing * zcosi * zcosh
                let a8 = zsing * zsini
                let a9 = zsing * zsinh + zcosg * zcosi * zcosh
                let a10 = zcosg * zsini
                let a2 = cosim * a7 + sinim * a8
                let a4 = cosim * a9 + sinim * a10
                let a5 = -sinim * a7 + cosim * a8
                let a6 = -sinim * a9 + cosim * a10

                let x1 = a1 * cosomm + a2 * sinomm
                let x2 = a3 * cosomm + a4 * sinomm
                let x3 = -a1 * sinomm + a2 * cosomm
                let x4 = -a3 * sinomm + a4 * cosomm
                let x5 = a5 * sinomm
                let x6 = a6 * sinomm
                let x7 = a5 * cosomm
                let x8 = a6 * cosomm

                z31 = 12.0 * x1 * x1 - 3.0 * x3 * x3
                z32 = 24.0 * x1 * x2 - 6.0 * x3 * x4
                z33 = 12.0 * x2 * x2 - 3.0 * x4 * x4
                z1 = 3.0 * (a1 * a1 + a2 * a2) + z31 * emsq
                z2 = 6.0 * (a1 * a3 + a2 * a4) + z32 * emsq
                z3 = 3.0 * (a3 * a3 + a4 * a4) + z33 * emsq
                z11 = -6.0 * a1 * a5 + emsq * (-24.0 * x1 * x7 - 6.0 * x3 * x5)
                z12 = -6.0 * (a1 * a6 + a3 * a5) + emsq * (-24.0 * (x2 * x7 + x1 * x8) - 6.0 * (x3 * x6 + x4 * x5))
                z13 = -6.0 * a3 * a6 + emsq * (-24.0 * x2 * x8 - 6.0 * x4 * x6)
                z21 = 6.0 * a2 * a5 + emsq * (24.0 * x1 * x5 - 6.0 * x3 * x7)
                z22 = 6.0 * (a4 * a5 + a2 * a6) + emsq * (24.0 * (x2 * x5 + x1 * x6) - 6.0 * (x4 * x7 + x3 * x8))
                z23 = 6.0 * a4 * a6 + emsq * (24.0 * x2 * x6 - 6.0 * x4 * x8)
                z1 = z1 + z1 + betasq * z31
                z2 = z2 + z2 + betasq * z32
                z3 = z3 + z3 + betasq * z33
                s3 = cc * xnoi
                s2 = -0.5 * s3 / rtemsq
                s4 = s3 * rtemsq
                s1 = -15.0 * em * s4
                s5 = x1 * x3 + x2 * x4
                s6 = x2 * x3 + x1 * x4
                s7 = x2 * x4 - x1 * x3

                if lsflg == 1 {
                    ss1 = s1; ss2 = s2; ss3 = s3; ss4 = s4; ss5 = s5; ss6 = s6; ss7 = s7
                    sz1 = z1; sz2 = z2; sz3 = z3
                    sz11 = z11; sz12 = z12; sz13 = z13
                    sz21 = z21; sz22 = z22; sz23 = z23
                    sz31 = z31; sz32 = z32; sz33 = z33
                    zcosg = zcosgl; zsing = zsingl; zcosi = zcosil; zsini = zsinil
                    zcosh = zcoshl * cnodm + zsinhl * snodm
                    zsinh = snodm * zcoshl - cnodm * zsinhl
                    cc = c1l
                }
            }

            zmol = fmod(4.7199672 + 0.22997150 * day - gam, twopi)
            zmos = fmod(6.2565837 + 0.017201977 * day, twopi)

            se2 = 2.0 * ss1 * ss6
            se3 = 2.0 * ss1 * ss7
            si2 = 2.0 * ss2 * sz12
            si3 = 2.0 * ss2 * (sz13 - sz11)
            sl2 = -2.0 * ss3 * sz2
            sl3 = -2.0 * ss3 * (sz3 - sz1)
            sl4 = -2.0 * ss3 * (-21.0 - 9.0 * emsq) * zes
            sgh2 = 2.0 * ss4 * sz32
            sgh3 = 2.0 * ss4 * (sz33 - sz31)
            sgh4 = -18.0 * ss4 * zes
            sh2 = -2.0 * ss2 * sz22
            sh3 = -2.0 * ss2 * (sz23 - sz21)

            ee2 = 2.0 * s1 * s6
            e3 = 2.0 * s1 * s7
            xi2 = 2.0 * s2 * z12
            xi3 = 2.0 * s2 * (z13 - z11)
            xl2 = -2.0 * s3 * z2
            xl3 = -2.0 * s3 * (z3 - z1)
            xl4 = -2.0 * s3 * (-21.0 - 9.0 * emsq) * zel
            xgh2 = 2.0 * s4 * z32
            xgh3 = 2.0 * s4 * (z33 - z31)
            xgh4 = -18.0 * s4 * zel
            xh2 = -2.0 * s2 * z22
            xh3 = -2.0 * s2 * (z23 - z21)

            // dpper with init == 'y' leaves the elements unchanged.

            // ---- dsinit ----
            let q22 = 1.7891679e-6, q31 = 2.1460748e-6, q33 = 2.2123015e-7
            let root22 = 1.7891679e-6, root44 = 7.3636953e-9, root54 = 2.1765803e-9
            let rptim = 4.37526908801129966e-3
            let root32 = 3.7393792e-7, root52 = 1.1428639e-7
            let znl = 1.5835218e-4, zns = 1.19459e-5

            irez = 0
            if 0.0034906585 < nm && nm < 0.0052359877 { irez = 1 }
            if 8.26e-3 <= nm && nm <= 9.24e-3 && em >= 0.5 { irez = 2 }

            let ses = ss1 * zns * ss5
            let sis = ss2 * zns * (sz11 + sz13)
            let sls = -zns * ss3 * (sz1 + sz3 - 14.0 - 6.0 * emsq)
            let sghs = ss4 * zns * (sz31 + sz33 - 6.0)
            var shs = -zns * ss2 * (sz21 + sz23)
            if inclm < 5.2359877e-2 || inclm > Double.pi - 5.2359877e-2 { shs = 0.0 }
            if sinim != 0.0 { shs = shs / sinim }
            let sgs = sghs - cosim * shs

            dedt = ses + s1 * znl * s5
            didt = sis + s2 * znl * (z11 + z13)
            dmdt = sls - znl * s3 * (z1 + z3 - 14.0 - 6.0 * emsq)
            let sghl = s4 * znl * (z31 + z33 - 6.0)
            var shll = -znl * s2 * (z21 + z23)
            if inclm < 5.2359877e-2 || inclm > Double.pi - 5.2359877e-2 { shll = 0.0 }
            domdt = sgs + sghl
            dnodt = shs
            if sinim != 0.0 {
                domdt = domdt - cosim / sinim * shll
                dnodt = dnodt + shll / sinim
            }

            let theta = fmod(gsto + tc * rptim, twopi)

            if irez != 0 {
                let aonv = pow(nm / xke, x2o3)
                if irez == 2 {
                    let cosisq = cosim * cosim
                    let em2 = ecco
                    let emsq2 = eccsq
                    let eoc = em2 * emsq2
                    let g201 = -0.306 - (em2 - 0.64) * 0.440
                    var g211 = 0.0, g310 = 0.0, g322 = 0.0, g410 = 0.0, g422 = 0.0, g520 = 0.0
                    var g533 = 0.0, g521 = 0.0, g532 = 0.0
                    if em2 <= 0.65 {
                        g211 = 3.616 - 13.2470 * em2 + 16.2900 * emsq2
                        g310 = -19.302 + 117.3900 * em2 - 228.4190 * emsq2 + 156.5910 * eoc
                        g322 = -18.9068 + 109.7927 * em2 - 214.6334 * emsq2 + 146.5816 * eoc
                        g410 = -41.122 + 242.6940 * em2 - 471.0940 * emsq2 + 313.9530 * eoc
                        g422 = -146.407 + 841.8800 * em2 - 1629.014 * emsq2 + 1083.4350 * eoc
                        g520 = -532.114 + 3017.977 * em2 - 5740.032 * emsq2 + 3708.2760 * eoc
                    } else {
                        g211 = -72.099 + 331.819 * em2 - 508.738 * emsq2 + 266.724 * eoc
                        g310 = -346.844 + 1582.851 * em2 - 2415.925 * emsq2 + 1246.113 * eoc
                        g322 = -342.585 + 1554.908 * em2 - 2366.899 * emsq2 + 1215.972 * eoc
                        g410 = -1052.797 + 4758.686 * em2 - 7193.992 * emsq2 + 3651.957 * eoc
                        g422 = -3581.690 + 16178.110 * em2 - 24462.770 * emsq2 + 12422.520 * eoc
                        if em2 > 0.715 {
                            g520 = -5149.66 + 29936.92 * em2 - 54087.36 * emsq2 + 31324.56 * eoc
                        } else {
                            g520 = 1464.74 - 4664.75 * em2 + 3763.64 * emsq2
                        }
                    }
                    if em2 < 0.7 {
                        g533 = -919.22770 + 4988.6100 * em2 - 9064.7700 * emsq2 + 5542.21 * eoc
                        g521 = -822.71072 + 4568.6173 * em2 - 8491.4146 * emsq2 + 5337.524 * eoc
                        g532 = -853.66600 + 4690.2500 * em2 - 8624.7700 * emsq2 + 5341.4 * eoc
                    } else {
                        g533 = -37995.780 + 161616.52 * em2 - 229838.20 * emsq2 + 109377.94 * eoc
                        g521 = -51752.104 + 218913.95 * em2 - 309468.16 * emsq2 + 146349.42 * eoc
                        g532 = -40023.880 + 170470.89 * em2 - 242699.48 * emsq2 + 115605.82 * eoc
                    }
                    let sini2 = sinim * sinim
                    let f220 = 0.75 * (1.0 + 2.0 * cosim + cosisq)
                    let f221 = 1.5 * sini2
                    let f321 = 1.875 * sinim * (1.0 - 2.0 * cosim - 3.0 * cosisq)
                    let f322 = -1.875 * sinim * (1.0 + 2.0 * cosim - 3.0 * cosisq)
                    let f441 = 35.0 * sini2 * f220
                    let f442 = 39.3750 * sini2 * sini2
                    let f522 = 9.84375 * sinim * (sini2 * (1.0 - 2.0 * cosim - 5.0 * cosisq)
                        + 0.33333333 * (-2.0 + 4.0 * cosim + 6.0 * cosisq))
                    let f523 = sinim * (4.92187512 * sini2 * (-2.0 - 4.0 * cosim + 10.0 * cosisq)
                        + 6.56250012 * (1.0 + 2.0 * cosim - 3.0 * cosisq))
                    let f542 = 29.53125 * sinim * (2.0 - 8.0 * cosim + cosisq * (-12.0 + 8.0 * cosim + 10.0 * cosisq))
                    let f543 = 29.53125 * sinim * (-2.0 - 8.0 * cosim + cosisq * (12.0 + 8.0 * cosim - 10.0 * cosisq))
                    let xno2 = nm * nm
                    let ainv2 = aonv * aonv
                    var t1 = 3.0 * xno2 * ainv2
                    var temp = t1 * root22
                    d2201 = temp * f220 * g201
                    d2211 = temp * f221 * g211
                    t1 = t1 * aonv
                    temp = t1 * root32
                    d3210 = temp * f321 * g310
                    d3222 = temp * f322 * g322
                    t1 = t1 * aonv
                    temp = 2.0 * t1 * root44
                    d4410 = temp * f441 * g410
                    d4422 = temp * f442 * g422
                    t1 = t1 * aonv
                    temp = t1 * root52
                    d5220 = temp * f522 * g520
                    d5232 = temp * f523 * g532
                    temp = 2.0 * t1 * root54
                    d5421 = temp * f542 * g521
                    d5433 = temp * f543 * g533
                    xlamo = fmod(mo + nodeo + nodeo - theta - theta, twopi)
                    xfact = mdot + dmdt + 2.0 * (nodedot + dnodt - rptim) - noUnkozai
                }
                if irez == 1 {
                    let g200 = 1.0 + emsq * (-2.5 + 0.8125 * emsq)
                    let g310 = 1.0 + 2.0 * emsq
                    let g300 = 1.0 + emsq * (-6.0 + 6.60937 * emsq)
                    let f220 = 0.75 * (1.0 + cosim) * (1.0 + cosim)
                    let f311 = 0.9375 * sinim * sinim * (1.0 + 3.0 * cosim) - 0.75 * (1.0 + cosim)
                    var f330 = 1.0 + cosim
                    f330 = 1.875 * f330 * f330 * f330
                    del1 = 3.0 * nm * nm * aonv * aonv
                    del2 = 2.0 * del1 * f220 * g200 * q22
                    del3 = 3.0 * del1 * f330 * g300 * q33 * aonv
                    del1 = del1 * f311 * g310 * q31 * aonv
                    xlamo = fmod(mo + nodeo + argpo - theta, twopi)
                    xfact = mdot + xpidot - rptim + dmdt + domdt + dnodt - noUnkozai
                }
            }
        }

        if !isimp {
            let cc1sq = cc1 * cc1
            d2 = 4.0 * ao * tsi * cc1sq
            let temp = d2 * tsi * cc1 / 3.0
            d3 = (17.0 * ao + sfour) * temp
            d4 = 0.5 * temp * ao * tsi * (221.0 * ao + 31.0 * sfour) * cc1
            t3cof = d2 + 2.0 * cc1sq
            t4cof = 0.25 * (3.0 * d3 + cc1 * (12.0 * d2 + 10.0 * cc1sq))
            t5cof = 0.2 * (3.0 * d4 + 12.0 * cc1 * d3 + 6.0 * d2 * d2 + 15.0 * cc1sq * (2.0 * d2 + cc1sq))
        }

        // Validate that the element set propagates at epoch.
        _ = try propagate(minutesSinceEpoch: 0)
    }

    // MARK: - Propagation

    /// Propagates to a Julian date (UTC).
    public func propagate(jd: Double) throws -> StateVector {
        try propagate(minutesSinceEpoch: (jd - elements.epochJD) * 1440.0)
    }

    public func propagate(date: Date) throws -> StateVector {
        try propagate(jd: date.julianDate)
    }

    public func propagate(minutesSinceEpoch t: Double) throws -> StateVector {
        let twopi = SGP4.twopi
        let x2o3 = SGP4.x2o3
        let vkmpersec = radiusEarthKm * xke / 60.0

        let xmdf = mo + mdot * t
        let argpdf = argpo + argpdot * t
        let nodedf = nodeo + nodedot * t
        var argpm = argpdf
        var mm = xmdf
        let t2 = t * t
        var nodem = nodedf + nodecf * t2
        var tempa = 1.0 - cc1 * t
        var tempe = bstar * cc4 * t
        var templ = t2cof * t2

        if !isimp {
            let delomg = omgcof * t
            let delmtemp = 1.0 + eta * cos(xmdf)
            let delm = xmcof * (delmtemp * delmtemp * delmtemp - delmo)
            let temp = delomg + delm
            mm = xmdf + temp
            argpm = argpdf - temp
            let t3 = t2 * t
            let t4 = t3 * t
            tempa = tempa - d2 * t2 - d3 * t3 - d4 * t4
            tempe = tempe + bstar * cc5 * (sin(mm) - sinmao)
            templ = templ + t3cof * t3 + t4 * (t4cof + t * t5cof)
        }

        var nm = noUnkozai
        var em = ecco
        var inclm = inclo

        if isDeepSpace {
            (em, argpm, inclm, mm, nodem, nm) = dspace(t: t, em: em, argpm: argpm, inclm: inclm,
                                                     mm: mm, nodem: nodem, nm: nm)
        }

        if nm <= 0.0 { throw SGP4Error.meanMotionNotPositive }

        let am = pow(xke / nm, x2o3) * tempa * tempa
        nm = xke / pow(am, 1.5)
        em = em - tempe

        if em >= 1.0 || em < -0.001 { throw SGP4Error.eccentricityOutOfRange }
        if em < 1.0e-6 { em = 1.0e-6 }

        mm = mm + noUnkozai * templ
        var xlm = mm + argpm + nodem
        nodem = fmod(nodem, twopi)
        argpm = fmod(argpm, twopi)
        xlm = fmod(xlm, twopi)
        mm = fmod(xlm - argpm - nodem, twopi)

        let sinim = sin(inclm)
        let cosim = cos(inclm)

        var ep = em
        var xincp = inclm
        var argpp = argpm
        var nodep = nodem
        var mp = mm
        var sinip = sinim
        var cosip = cosim

        var aycof = self.aycof
        var xlcof = self.xlcof
        var con41 = self.con41
        var x1mth2 = self.x1mth2
        var x7thm1 = self.x7thm1

        if isDeepSpace {
            (ep, xincp, nodep, argpp, mp) = dpper(t: t, ep: ep, inclp: xincp, nodep: nodep, argpp: argpp, mp: mp)
            if xincp < 0.0 {
                xincp = -xincp
                nodep = nodep + .pi
                argpp = argpp - .pi
            }
            if ep < 0.0 || ep > 1.0 { throw SGP4Error.perturbedEccentricityOutOfRange }

            sinip = sin(xincp)
            cosip = cos(xincp)
            aycof = -0.5 * j3oj2 * sinip
            if abs(cosip + 1.0) > 1.5e-12 {
                xlcof = -0.25 * j3oj2 * sinip * (3.0 + 5.0 * cosip) / (1.0 + cosip)
            } else {
                xlcof = -0.25 * j3oj2 * sinip * (3.0 + 5.0 * cosip) / 1.5e-12
            }
        }

        let axnl = ep * cos(argpp)
        var temp = 1.0 / (am * (1.0 - ep * ep))
        let aynl = ep * sin(argpp) + temp * aycof
        let xl = mp + argpp + nodep + temp * xlcof * axnl

        // Kepler's equation
        let u = fmod(xl - nodep, twopi)
        var eo1 = u
        var tem5 = 9999.9
        var ktr = 1
        var sineo1 = 0.0, coseo1 = 0.0
        while abs(tem5) >= 1.0e-12 && ktr <= 10 {
            sineo1 = sin(eo1)
            coseo1 = cos(eo1)
            tem5 = 1.0 - coseo1 * axnl - sineo1 * aynl
            tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5
            if abs(tem5) >= 0.95 {
                tem5 = tem5 > 0.0 ? 0.95 : -0.95
            }
            eo1 = eo1 + tem5
            ktr += 1
        }

        let ecose = axnl * coseo1 + aynl * sineo1
        let esine = axnl * sineo1 - aynl * coseo1
        let el2 = axnl * axnl + aynl * aynl
        let pl = am * (1.0 - el2)
        if pl < 0.0 { throw SGP4Error.semiLatusRectumNegative }

        let rl = am * (1.0 - ecose)
        let rdotl = am.squareRoot() * esine / rl
        let rvdotl = pl.squareRoot() / rl
        let betal = (1.0 - el2).squareRoot()
        temp = esine / (1.0 + betal)
        let sinu = am / rl * (sineo1 - aynl - axnl * temp)
        let cosu = am / rl * (coseo1 - axnl + aynl * temp)
        var su = atan2(sinu, cosu)
        let sin2u = (cosu + cosu) * sinu
        let cos2u = 1.0 - 2.0 * sinu * sinu
        temp = 1.0 / pl
        let temp1 = 0.5 * j2 * temp
        let temp2 = temp1 * temp

        if isDeepSpace {
            let cosisq = cosip * cosip
            con41 = 3.0 * cosisq - 1.0
            x1mth2 = 1.0 - cosisq
            x7thm1 = 7.0 * cosisq - 1.0
        }

        let mrt = rl * (1.0 - 1.5 * temp2 * betal * con41) + 0.5 * temp1 * x1mth2 * cos2u
        su = su - 0.25 * temp2 * x7thm1 * sin2u
        let xnode = nodep + 1.5 * temp2 * cosip * sin2u
        let xinc = xincp + 1.5 * temp2 * cosip * sinip * cos2u
        let mvt = rdotl - nm * temp1 * x1mth2 * sin2u / xke
        let rvdot = rvdotl + nm * temp1 * (x1mth2 * cos2u + 1.5 * con41) / xke

        let sinsu = sin(su), cossu = cos(su)
        let snod = sin(xnode), cnod = cos(xnode)
        let sini = sin(xinc), cosi = cos(xinc)
        let xmx = -snod * cosi
        let xmy = cnod * cosi
        let ux = xmx * sinsu + cnod * cossu
        let uy = xmy * sinsu + snod * cossu
        let uz = sini * sinsu
        let vx = xmx * cossu - cnod * sinsu
        let vy = xmy * cossu - snod * sinsu
        let vz = sini * cossu

        if mrt < 1.0 { throw SGP4Error.decayed }

        let mr = mrt * radiusEarthKm
        return StateVector(
            position: Vector3(mr * ux, mr * uy, mr * uz),
            velocity: Vector3((mvt * ux + rvdot * vx) * vkmpersec,
                              (mvt * uy + rvdot * vy) * vkmpersec,
                              (mvt * uz + rvdot * vz) * vkmpersec))
    }

    // MARK: - Deep space helpers

    /// Lunar-solar periodics (Vallado `dpper`, init == 'n', improved mode).
    private func dpper(t: Double, ep: Double, inclp: Double, nodep: Double, argpp: Double, mp: Double)
        -> (Double, Double, Double, Double, Double) {
        let twopi = SGP4.twopi
        let zns = 1.19459e-5, zes = 0.01675
        let znl = 1.5835218e-4, zel = 0.05490

        var zm = zmos + zns * t
        var zf = zm + 2.0 * zes * sin(zm)
        var sinzf = sin(zf)
        var f2 = 0.5 * sinzf * sinzf - 0.25
        var f3 = -0.5 * sinzf * cos(zf)
        let ses = se2 * f2 + se3 * f3
        let sis = si2 * f2 + si3 * f3
        let sls = sl2 * f2 + sl3 * f3 + sl4 * sinzf
        let sghs = sgh2 * f2 + sgh3 * f3 + sgh4 * sinzf
        let shs = sh2 * f2 + sh3 * f3

        zm = zmol + znl * t
        zf = zm + 2.0 * zel * sin(zm)
        sinzf = sin(zf)
        f2 = 0.5 * sinzf * sinzf - 0.25
        f3 = -0.5 * sinzf * cos(zf)
        let sel = ee2 * f2 + e3 * f3
        let sil = xi2 * f2 + xi3 * f3
        let sll = xl2 * f2 + xl3 * f3 + xl4 * sinzf
        let sghl = xgh2 * f2 + xgh3 * f3 + xgh4 * sinzf
        let shll = xh2 * f2 + xh3 * f3

        let pe = ses + sel - peo
        let pinc = sis + sil - pinco
        let pl = sls + sll - plo
        var pgh = sghs + sghl - pgho
        var ph = shs + shll - pho

        let inclp = inclp + pinc
        let ep = ep + pe
        var nodep = nodep
        var argpp = argpp
        var mp = mp
        let sinip = sin(inclp)
        let cosip = cos(inclp)

        if inclp >= 0.2 {
            ph /= sinip
            pgh -= cosip * ph
            argpp += pgh
            nodep += ph
            mp += pl
        } else {
            // Lyddane modification
            let sinop = sin(nodep)
            let cosop = cos(nodep)
            var alfdp = sinip * sinop
            var betdp = sinip * cosop
            let dalf = ph * cosop + pinc * cosip * sinop
            let dbet = -ph * sinop + pinc * cosip * cosop
            alfdp += dalf
            betdp += dbet
            nodep = fmod(nodep, twopi)
            let xls = mp + argpp + pl + pgh + (cosip - pinc * sinip) * nodep
            let xnoh = nodep
            nodep = atan2(alfdp, betdp)
            if abs(xnoh - nodep) > .pi {
                if nodep < xnoh { nodep += twopi } else { nodep -= twopi }
            }
            mp += pl
            argpp = xls - mp - cosip * nodep
        }
        return (ep, inclp, nodep, argpp, mp)
    }

    /// Deep-space secular effects and resonance integration (Vallado `dspace`).
    private func dspace(t: Double, em: Double, argpm: Double, inclm: Double, mm: Double, nodem: Double, nm: Double)
        -> (Double, Double, Double, Double, Double, Double) {
        let twopi = SGP4.twopi
        let fasx2 = 0.13130908, fasx4 = 2.8843198, fasx6 = 0.37448087
        let g22 = 5.7686396, g32 = 0.95240898, g44 = 1.8014998, g52 = 1.0508330, g54 = 4.4108898
        let rptim = 4.37526908801129966e-3
        let stepp = 720.0, stepn = -720.0, step2 = 259200.0

        let theta = fmod(gsto + t * rptim, twopi)
        let em = em + dedt * t
        let inclm = inclm + didt * t
        let argpm = argpm + domdt * t
        let nodem = nodem + dnodt * t
        var mm = mm + dmdt * t
        var nm = nm

        if irez != 0 {
            // Integrate from epoch each call so this method stays free of side effects.
            var atime = 0.0
            var xni = noUnkozai
            var xli = xlamo
            let delt = t > 0.0 ? stepp : stepn
            var ft = 0.0
            var xndt = 0.0, xldot = 0.0, xnddt = 0.0

            while true {
                if irez != 2 {
                    xndt = del1 * sin(xli - fasx2) + del2 * sin(2.0 * (xli - fasx4)) + del3 * sin(3.0 * (xli - fasx6))
                    xldot = xni + xfact
                    xnddt = del1 * cos(xli - fasx2) + 2.0 * del2 * cos(2.0 * (xli - fasx4))
                        + 3.0 * del3 * cos(3.0 * (xli - fasx6))
                    xnddt = xnddt * xldot
                } else {
                    let xomi = argpo + argpdot * atime
                    let x2omi = xomi + xomi
                    let x2li = xli + xli
                    xndt = d2201 * sin(x2omi + xli - g22) + d2211 * sin(xli - g22)
                        + d3210 * sin(xomi + xli - g32) + d3222 * sin(-xomi + xli - g32)
                        + d4410 * sin(x2omi + x2li - g44) + d4422 * sin(x2li - g44)
                        + d5220 * sin(xomi + xli - g52) + d5232 * sin(-xomi + xli - g52)
                        + d5421 * sin(xomi + x2li - g54) + d5433 * sin(-xomi + x2li - g54)
                    xldot = xni + xfact
                    xnddt = d2201 * cos(x2omi + xli - g22) + d2211 * cos(xli - g22)
                        + d3210 * cos(xomi + xli - g32) + d3222 * cos(-xomi + xli - g32)
                        + d5220 * cos(xomi + xli - g52) + d5232 * cos(-xomi + xli - g52)
                        + 2.0 * (d4410 * cos(x2omi + x2li - g44) + d4422 * cos(x2li - g44)
                            + d5421 * cos(xomi + x2li - g54) + d5433 * cos(-xomi + x2li - g54))
                    xnddt = xnddt * xldot
                }

                if abs(t - atime) >= stepp {
                    xli = xli + xldot * delt + xndt * step2
                    xni = xni + xndt * delt + xnddt * step2
                    atime = atime + delt
                } else {
                    ft = t - atime
                    break
                }
            }

            nm = xni + xndt * ft + xnddt * ft * ft * 0.5
            let xl = xli + xldot * ft + xndt * ft * ft * 0.5
            if irez != 1 {
                mm = xl - 2.0 * nodem + 2.0 * theta
            } else {
                mm = xl - nodem - argpm + theta
            }
            let dndt = nm - noUnkozai
            nm = noUnkozai + dndt
        }
        return (em, argpm, inclm, mm, nodem, nm)
    }
}
